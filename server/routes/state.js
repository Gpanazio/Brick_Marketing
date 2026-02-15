const express = require('express');
const router = express.Router();
const { log } = require('../helpers/logger');
const { query, getFilesByCategory } = require('../helpers/db');

// API: Get all state (including failed, revisions, pending feedbacks)
router.get('/state', async (req, res) => {
    const mode = req.query.mode || 'marketing';

    try {
        const [briefing, wip, done, failed] = await Promise.all([
            getFilesByCategory(mode, 'briefing'),
            getFilesByCategory(mode, 'wip'),
            getFilesByCategory(mode, 'done'),
            getFilesByCategory(mode, 'failed')
        ]);

        // Pending feedbacks
        const fbRes = await query(
            `SELECT job_id AS "jobId", text, created_at AS timestamp
             FROM feedbacks WHERE mode = $1 AND status = 'pending'
             ORDER BY created_at DESC`,
            [mode]
        );

        // Revisions (files ending in _revision_diff.json)
        const revRes = await query(
            `SELECT filename, content
             FROM pipeline_files
             WHERE mode = $1 AND filename LIKE '%_revision_diff.json'
             ORDER BY created_at DESC`,
            [mode]
        );
        const revisions = revRes.rows.map(r => {
            try {
                const parsed = JSON.parse(r.content);
                return { filename: r.filename, ...parsed };
            } catch (e) {
                return { filename: r.filename, status: 'error' };
            }
        });

        res.json({
            mode,
            briefing,
            wip,
            done,
            failed,
            revisions,
            pendingFeedbacks: fbRes.rows.map(r => ({
                jobId: r.jobId,
                text: r.text,
                timestamp: r.timestamp
            }))
        });
    } catch (err) {
        log('error', 'state_fetch_failed', { error: err.message });
        res.status(500).json({ error: 'Failed to fetch state', detail: err.message });
    }
});

// API: Get pending briefings (for watcher)
router.get('/pending', async (req, res) => {
    const mode = req.query.mode || 'marketing';

    try {
        // Briefings that have no corresponding wip files
        const result = await query(`
            SELECT b.filename AS name, b.content, b.category AS path,
                   b.updated_at AS mtime
            FROM pipeline_files b
            WHERE b.mode = $1 AND b.category = 'briefing'
              AND NOT EXISTS (
                  SELECT 1 FROM pipeline_files w
                  WHERE w.mode = $1 AND w.category = 'wip'
                    AND w.job_id = b.job_id
              )
            ORDER BY b.created_at ASC
        `, [mode]);

        res.json({
            briefings: result.rows.map(r => ({
                name: r.name,
                content: r.content || '',
                path: `briefing/${r.name}`,
                mtime: r.mtime ? r.mtime.toISOString() : new Date().toISOString()
            }))
        });
    } catch (err) {
        log('error', 'pending_fetch_failed', { error: err.message });
        res.status(500).json({ error: 'Failed to fetch pending briefings' });
    }
});

// API: Get history (archived projects)
router.get('/history', async (req, res) => {
    try {
        const result = await query(`
            SELECT pf.filename AS name, pf.content, pf.updated_at AS mtime
            FROM pipeline_files pf
            JOIN projects p ON pf.job_id = p.job_id AND pf.mode = p.mode
            WHERE p.status = 'archived' AND p.deleted_at IS NULL
            ORDER BY p.archived_at DESC
        `);

        res.json({
            history: result.rows.map(r => ({
                name: r.name,
                content: r.content || '',
                mtime: r.mtime ? r.mtime.toISOString() : new Date().toISOString()
            }))
        });
    } catch (err) {
        log('error', 'history_fetch_failed', { error: err.message });
        res.status(500).json({ error: 'Failed to fetch history' });
    }
});

// API: Get archived projects (for lobby)
router.get('/archived', async (req, res) => {
    const mode = req.query.mode || 'marketing';

    try {
        const result = await query(`
            SELECT p.job_id, p.title, p.mode, p.archived_at,
                   COUNT(pf.id) AS file_count
            FROM projects p
            LEFT JOIN pipeline_files pf ON pf.job_id = p.job_id AND pf.mode = p.mode
            WHERE p.mode = $1 AND p.status = 'archived' AND p.deleted_at IS NULL
            GROUP BY p.id
            ORDER BY p.archived_at DESC
        `, [mode]);

        res.json({ archived: result.rows });
    } catch (err) {
        log('error', 'archived_fetch_failed', { error: err.message });
        res.status(500).json({ error: 'Failed to fetch archived projects' });
    }
});

// API: Squad Architecture (read-only) — unchanged, reads from file
router.get('/architecture', (req, res) => {
    const fs = require('fs');
    const path = require('path');
    const baseDir = path.join(__dirname, '..', '..');
    const possiblePaths = [
        path.join(baseDir, 'SQUAD_ARCHITECTURE.md'),
        path.join(process.cwd(), 'SQUAD_ARCHITECTURE.md'),
        path.join(baseDir, '..', 'SQUAD_ARCHITECTURE.md')
    ];

    let content = null;
    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            content = fs.readFileSync(p, 'utf-8');
            break;
        }
    }

    if (!content) {
        return res.status(404).json({ error: 'SQUAD_ARCHITECTURE.md not found' });
    }
    res.json({ content });
});

module.exports = router;
