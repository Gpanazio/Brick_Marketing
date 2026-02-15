const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { log } = require('../helpers/logger');
const { getModeRoot } = require('../helpers/paths');
const { sanitizePath } = require('../middleware/security');
const { emitStateUpdate } = require('../helpers/socket');
const { trackStep, getMetrics } = require('../helpers/metrics');
const { schemas, validate, getBotNameFromFilename } = require('../../contracts/schemas');
const { query, ensureProject, savePipelineFile } = require('../helpers/db');

// API: Submit result from agent (com validação de schema)
router.post('/result', async (req, res) => {
    const { filename, content, category, botName, durationMs, model, mode } = req.body;

    // SECURITY: Sanitize paths
    const safeFilename = sanitizePath(filename);
    const safeCategory = sanitizePath(category || 'wip');

    if (!safeFilename || !safeCategory) {
        return res.status(400).json({ error: 'Invalid path detected' });
    }

    const root = getModeRoot(mode || 'marketing');
    const targetCategory = safeCategory;
    const filePath = path.join(root, targetCategory, safeFilename);

    // Ensure directory exists
    const dirPath = path.dirname(filePath);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });

    // Validate against schema if it's a JSON result
    if (content && typeof content === 'string') {
        try {
            const parsed = JSON.parse(content);
            const detectedBot = botName || getBotNameFromFilename(filename);
            if (detectedBot && schemas[detectedBot]) {
                const validation = validate(detectedBot, parsed);
                if (!validation.valid) {
                    log('warn', 'schema_validation_failed', { filename, bot: detectedBot, errors: validation.errors });
                    return res.status(400).json({ error: 'Schema validation failed', bot: detectedBot, errors: validation.errors });
                }
            }
        } catch (e) {
            log('warn', 'json_parse_failed', { filename, error: e.message });
        }
    }

    if (botName && durationMs) {
        trackStep(botName, true, durationMs, model);
    }

    // Filesystem write
    fs.writeFileSync(filePath, content);

    // DB write
    try {
        // Extract jobId from filename
        const match = safeFilename.match(/^(\d{10,})/);
        const jobId = match ? match[1] : safeFilename.replace(/\.[^.]+$/, '');

        await ensureProject(jobId, mode || 'marketing', null, targetCategory === 'done' ? 'done' : 'wip');
        await savePipelineFile(jobId, mode || 'marketing', targetCategory, safeFilename, content, botName, model, durationMs);
    } catch (dbErr) {
        log('warn', 'result_db_write_failed', { error: dbErr.message, filename: safeFilename });
    }

    log('info', 'result_submitted', { filename, category: targetCategory, botName, mode: mode || 'marketing' });
    const metrics = getMetrics();
    metrics.requests.total++;
    metrics.requests.success++;
    const io = req.app.get('io');
    emitStateUpdate(io, mode || 'marketing');
    res.json({ success: true, filename, category: targetCategory });
});

// API: Move File (Approve/Reject)
router.post('/move', async (req, res) => {
    const { filename, from, to, mode } = req.body;

    const safeFilename = sanitizePath(filename);
    const safeFrom = sanitizePath(from);
    const safeTo = sanitizePath(to);

    if (!safeFilename || !safeFrom || !safeTo) {
        return res.status(400).json({ error: 'Invalid path detected' });
    }

    const root = getModeRoot(mode || 'marketing');
    const srcPath = path.join(root, safeFrom, safeFilename);
    const destPath = path.join(root, safeTo, safeFilename);

    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    if (fs.existsSync(srcPath)) {
        fs.renameSync(srcPath, destPath);

        // DB: update category
        try {
            const match = safeFilename.match(/^(\d{10,})/);
            const jobId = match ? match[1] : safeFilename.replace(/\.[^.]+$/, '');
            await query(
                `UPDATE pipeline_files SET category = $1, updated_at = NOW()
                 WHERE job_id = $2 AND mode = $3 AND filename = $4`,
                [safeTo, jobId, mode || 'marketing', safeFilename]
            );
            if (safeTo === 'done') {
                await ensureProject(jobId, mode || 'marketing', null, 'done');
            }
        } catch (dbErr) {
            log('warn', 'move_db_update_failed', { error: dbErr.message });
        }

        log('info', 'file_moved', { filename, from: safeFrom, to: safeTo, mode: mode || 'marketing' });
        const io = req.app.get('io');
        emitStateUpdate(io, mode || 'marketing');
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: Delete File
router.delete('/file', async (req, res) => {
    const { category, filename, mode } = req.body;

    const safeCategory = sanitizePath(category);
    const safeFilename = sanitizePath(filename);

    if (!safeCategory || !safeFilename) {
        return res.status(400).json({ error: 'Invalid path detected' });
    }

    const root = getModeRoot(mode || 'marketing');
    const filePath = path.join(root, safeCategory, safeFilename);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);

        // DB: delete file
        try {
            const match = safeFilename.match(/^(\d{10,})/);
            const jobId = match ? match[1] : safeFilename.replace(/\.[^.]+$/, '');
            await query(
                `DELETE FROM pipeline_files WHERE job_id = $1 AND mode = $2 AND filename = $3`,
                [jobId, mode || 'marketing', safeFilename]
            );
        } catch (dbErr) {
            log('warn', 'file_delete_db_failed', { error: dbErr.message });
        }

        log('info', 'file_deleted', { filename, category: safeCategory, mode: mode || 'marketing' });
        const io = req.app.get('io');
        emitStateUpdate(io, mode || 'marketing');
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: Archive project (move to archived status)
router.post('/archive', async (req, res) => {
    const { filename, jobId, mode } = req.body;
    const { MARKETING_ROOT, PROJETOS_ROOT } = require('../helpers/paths');
    const effectiveMode = mode || 'marketing';
    const baseDir = effectiveMode === 'projetos' ? PROJETOS_ROOT : require('../helpers/paths').getModeRoot(effectiveMode);

    // If jobId is provided, archive entire project
    const effectiveJobId = jobId || (filename ? filename.match(/^(\d{10,})/)?.[1] : null);

    if (!effectiveJobId) {
        return res.status(400).json({ error: 'jobId or filename required' });
    }

    // Filesystem: move from done to history
    if (filename) {
        const src = path.join(baseDir, 'done', filename);
        const timestamp = new Date().toISOString().split('T')[0];
        const destFilename = `${timestamp}_${filename}`;
        const historyDir = path.join(baseDir, 'history');
        if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });
        const dest = path.join(historyDir, destFilename);
        if (fs.existsSync(src)) {
            fs.renameSync(src, dest);
            log('info', 'file_archived', { filename, archived: destFilename, mode: effectiveMode });
        }
    }

    // DB: archive project
    try {
        await query(
            `UPDATE projects SET status = 'archived', archived_at = NOW(), updated_at = NOW()
             WHERE job_id = $1 AND mode = $2`,
            [effectiveJobId, effectiveMode]
        );
        // Move all pipeline files to 'history' category
        await query(
            `UPDATE pipeline_files SET category = 'history', updated_at = NOW()
             WHERE job_id = $1 AND mode = $2`,
            [effectiveJobId, effectiveMode]
        );
        log('info', 'project_archived_db', { jobId: effectiveJobId, mode: effectiveMode });
    } catch (dbErr) {
        log('warn', 'archive_db_failed', { error: dbErr.message });
    }

    const io = req.app.get('io');
    emitStateUpdate(io, effectiveMode);
    res.json({ success: true, jobId: effectiveJobId, archived: true });
});

// API: Restore archived project
router.post('/restore', async (req, res) => {
    const { jobId, mode } = req.body;
    const effectiveMode = mode || 'marketing';

    if (!jobId) {
        return res.status(400).json({ error: 'jobId required' });
    }

    try {
        await query(
            `UPDATE projects SET status = 'done', archived_at = NULL, updated_at = NOW()
             WHERE job_id = $1 AND mode = $2 AND status = 'archived'`,
            [jobId, effectiveMode]
        );
        await query(
            `UPDATE pipeline_files SET category = 'done', updated_at = NOW()
             WHERE job_id = $1 AND mode = $2 AND category = 'history'`,
            [jobId, effectiveMode]
        );

        log('info', 'project_restored', { jobId, mode: effectiveMode });
        const io = req.app.get('io');
        emitStateUpdate(io, effectiveMode);
        res.json({ success: true, jobId, restored: true });
    } catch (err) {
        log('error', 'restore_failed', { error: err.message, jobId });
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
