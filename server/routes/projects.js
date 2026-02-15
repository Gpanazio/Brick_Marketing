const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { log } = require('../helpers/logger');
const { getModeRoot, MARKETING_ROOT, findFile } = require('../helpers/paths');
const { emitStateUpdate } = require('../helpers/socket');
const { query, ensureProject } = require('../helpers/db');

// API: Dead Letter Queue - move failed jobs with metadata
router.post('/fail', async (req, res) => {
    const { filename, step, error, originalContent, mode } = req.body;
    const effectiveMode = mode || 'marketing';
    const failedPath = path.join(MARKETING_ROOT, 'failed');
    if (!fs.existsSync(failedPath)) fs.mkdirSync(failedPath, { recursive: true });

    const errorMeta = {
        filename, step, error,
        timestamp: new Date().toISOString(),
        retryable: true
    };

    // Filesystem
    const errorFile = path.join(failedPath, `${filename}.error.json`);
    fs.writeFileSync(errorFile, JSON.stringify(errorMeta, null, 2));
    if (originalContent) {
        fs.writeFileSync(path.join(failedPath, filename), originalContent);
    }

    // DB
    try {
        const jobId = filename.replace(/\.[^.]+$/, '').split('_')[0];
        await ensureProject(jobId, effectiveMode, null, 'failed');
        await query(
            `INSERT INTO pipeline_files (job_id, mode, category, filename, content)
             VALUES ($1, $2, 'failed', $3, $4)`,
            [jobId, effectiveMode, `${filename}.error.json`, JSON.stringify(errorMeta)]
        );
        if (originalContent) {
            await query(
                `INSERT INTO pipeline_files (job_id, mode, category, filename, content)
                 VALUES ($1, $2, 'failed', $3, $4)`,
                [jobId, effectiveMode, filename, originalContent]
            );
        }
    } catch (dbErr) {
        log('warn', 'fail_db_write_failed', { error: dbErr.message });
    }

    log('info', 'job_failed', { filename, step, error });
    const io = req.app.get('io');
    emitStateUpdate(io, effectiveMode);
    res.json({ success: true, failedPath: errorFile });
});

// API: Retry failed job
router.post('/retry', async (req, res) => {
    const { filename, mode } = req.body;
    const effectiveMode = mode || 'marketing';
    const failedPath = path.join(MARKETING_ROOT, 'failed');
    const briefingPath = path.join(MARKETING_ROOT, 'briefing');
    const src = path.join(failedPath, filename);

    if (fs.existsSync(src)) {
        fs.renameSync(src, path.join(briefingPath, filename));
        const errorFile = path.join(failedPath, `${filename}.error.json`);
        if (fs.existsSync(errorFile)) fs.unlinkSync(errorFile);

        // DB: move from failed to briefing
        try {
            const jobId = filename.replace(/\.[^.]+$/, '').split('_')[0];
            await query(
                `UPDATE pipeline_files SET category = 'briefing', updated_at = NOW()
                 WHERE job_id = $1 AND mode = $2 AND category = 'failed' AND filename = $3`,
                [jobId, effectiveMode, filename]
            );
            await query(
                `DELETE FROM pipeline_files WHERE job_id = $1 AND mode = $2 AND filename = $3`,
                [jobId, effectiveMode, `${filename}.error.json`]
            );
            await ensureProject(jobId, effectiveMode, null, 'briefing');
        } catch (dbErr) {
            log('warn', 'retry_db_update_failed', { error: dbErr.message });
        }

        log('info', 'job_retried', { filename });
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: Re-run job (move back to briefing and clear progress)
router.post('/rerun', async (req, res) => {
    const { jobId, mode } = req.body;
    const effectiveMode = mode || 'marketing';
    const root = getModeRoot(effectiveMode);
    const briefingDir = path.join(root, 'briefing');
    let briefingFile = null;

    briefingFile = findFile(briefingDir, jobId);

    if (!briefingFile) {
        const wipDir = path.join(root, 'wip');
        if (fs.existsSync(wipDir)) {
            const wipFiles = fs.readdirSync(wipDir).filter(f => f.includes(jobId));
            for (const wf of wipFiles) {
                const content = fs.readFileSync(path.join(wipDir, wf), 'utf-8');
                const jobIdMatch = content.match(/\*\*Job ID:\*\*\s*(\S+)/);
                if (jobIdMatch) {
                    const originalJobId = jobIdMatch[1];
                    briefingFile = findFile(briefingDir, originalJobId);
                    if (briefingFile) break;
                }
            }
            if (!briefingFile) {
                const rawFile = wipFiles.find(f => f.includes('RAW_IDEA'));
                const processedFile = wipFiles.find(f => f.includes('PROCESSED'));
                const sourceFile = rawFile || processedFile;
                if (sourceFile) {
                    const cleanName = jobId + '.md';
                    fs.copyFileSync(path.join(wipDir, sourceFile), path.join(briefingDir, cleanName));
                    briefingFile = cleanName;
                }
            }
        }
    }

    if (!briefingFile) {
        return res.status(404).json({ error: 'Briefing original não encontrado para re-run' });
    }

    // Filesystem cleanup
    const idsToClean = [jobId];
    ['wip', 'done', 'failed', 'approved'].forEach(dir => {
        const dirPath = path.join(root, dir);
        if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath).filter(f => idsToClean.some(id => f.includes(id)));
            files.forEach(f => {
                fs.unlinkSync(path.join(dirPath, f));
                log('info', 'rerun_cleanup', { dir, file: f });
            });
        }
    });

    const briefingPathFull = path.join(briefingDir, briefingFile);
    const content = fs.readFileSync(briefingPathFull, 'utf-8');
    fs.writeFileSync(briefingPathFull, content);

    // DB cleanup
    try {
        await query(
            `DELETE FROM pipeline_files WHERE job_id = $1 AND mode = $2 AND category != 'briefing'`,
            [jobId, effectiveMode]
        );
        await ensureProject(jobId, effectiveMode, null, 'briefing');
    } catch (dbErr) {
        log('warn', 'rerun_db_cleanup_failed', { error: dbErr.message });
    }

    const io = req.app.get('io');
    log('info', 'job_rerun_triggered', { jobId, mode: effectiveMode, briefingFile });
    emitStateUpdate(io, effectiveMode);

    io.to('runner').emit('pipeline:run', {
        action: 'rerun', mode: effectiveMode, jobId,
        content: fs.readFileSync(briefingPathFull, 'utf-8'),
    });

    if (process.env.OPENROUTER_API_KEY) {
        const briefingContent = fs.readFileSync(briefingPathFull, 'utf-8');
        log('info', 'auto_pipeline_rerun', { jobId, mode: effectiveMode });
        const { startPipelineAsync } = require('./pipeline');
        startPipelineAsync(req.app, effectiveMode, jobId, briefingContent);
    }

    res.json({ success: true, message: 'Job reiniciado', briefingFile });
});

// API: Delete project (all files matching jobId) — soft delete in DB
router.delete('/project/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const { mode } = req.query;

    if (!jobId || !mode) {
        return res.status(400).json({ error: 'jobId and mode required' });
    }

    const root = getModeRoot(mode);
    const dirs = ['briefing', 'wip', 'done', 'failed'];
    let deletedCount = 0;
    const deletedFiles = [];

    // Filesystem delete
    dirs.forEach(dir => {
        const dirPath = path.join(root, dir);
        if (!fs.existsSync(dirPath)) return;
        const files = fs.readdirSync(dirPath).filter(f => f.startsWith(jobId));
        files.forEach(file => {
            const filePath = path.join(dirPath, file);
            try {
                fs.unlinkSync(filePath);
                deletedFiles.push(`${dir}/${file}`);
                deletedCount++;
                log('info', 'project_file_deleted', { jobId, file, dir, mode });
            } catch (e) {
                log('error', 'project_delete_failed', { jobId, file, dir, error: e.message });
            }
        });
    });

    // DB: soft delete project + hard delete files
    try {
        await query(
            `UPDATE projects SET deleted_at = NOW(), status = 'deleted', updated_at = NOW()
             WHERE job_id = $1 AND mode = $2`,
            [jobId, mode]
        );
        await query(
            `DELETE FROM pipeline_files WHERE job_id = $1 AND mode = $2`,
            [jobId, mode]
        );
        await query(
            `DELETE FROM feedbacks WHERE job_id = $1 AND mode = $2`,
            [jobId, mode]
        );
    } catch (dbErr) {
        log('warn', 'project_delete_db_failed', { error: dbErr.message, jobId });
    }

    const io = req.app.get('io');
    emitStateUpdate(io, mode);
    res.json({ success: true, jobId, mode, deletedCount, files: deletedFiles });
});

// Shareable pipeline URLs
router.get(/^\/(ideias|marketing|projetos)\/([\s\S]+)$/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

module.exports = router;
