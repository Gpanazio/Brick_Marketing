const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { log } = require('../helpers/logger');
const { getModeRoot, MARKETING_ROOT, findFile } = require('../helpers/paths');
const { emitStateUpdate } = require('../helpers/socket');

// API: Dead Letter Queue - move failed jobs with metadata
router.post('/fail', (req, res) => {
    const { filename, step, error, originalContent } = req.body;
    const failedPath = path.join(MARKETING_ROOT, 'failed');
    if (!fs.existsSync(failedPath)) fs.mkdirSync(failedPath, { recursive: true });

    const errorMeta = {
        filename, step, error,
        timestamp: new Date().toISOString(),
        retryable: true
    };

    const errorFile = path.join(failedPath, `${filename}.error.json`);
    fs.writeFileSync(errorFile, JSON.stringify(errorMeta, null, 2));

    if (originalContent) {
        fs.writeFileSync(path.join(failedPath, filename), originalContent);
    }

    log('info', 'job_failed', { filename, step, error });
    const io = req.app.get('io');
    emitStateUpdate(io, 'marketing');
    res.json({ success: true, failedPath: errorFile });
});

// API: Retry failed job
router.post('/retry', (req, res) => {
    const { filename } = req.body;
    const failedPath = path.join(MARKETING_ROOT, 'failed');
    const briefingPath = path.join(MARKETING_ROOT, 'briefing');
    const src = path.join(failedPath, filename);

    if (fs.existsSync(src)) {
        fs.renameSync(src, path.join(briefingPath, filename));
        const errorFile = path.join(failedPath, `${filename}.error.json`);
        if (fs.existsSync(errorFile)) fs.unlinkSync(errorFile);
        log('info', 'job_retried', { filename });
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: Re-run job (move back to briefing and clear progress)
router.post('/rerun', (req, res) => {
    const { jobId, mode } = req.body;
    const root = getModeRoot(mode || 'marketing');
    const briefingDir = path.join(root, 'briefing');
    let briefingFile = null;

    // Helper de busca
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
                    if (briefingFile) {
                        log('info', 'rerun_found_via_content', { wipFile: wf, originalJobId });
                        break;
                    }
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
                    log('info', 'rerun_restored_from_wip', { source: sourceFile, newBriefing: cleanName });
                }
            }
        }
    }

    if (!briefingFile) {
        return res.status(404).json({ error: 'Briefing original não encontrado para re-run' });
    }

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

    const briefingPath = path.join(briefingDir, briefingFile);
    const content = fs.readFileSync(briefingPath, 'utf-8');
    fs.writeFileSync(briefingPath, content);

    const io = req.app.get('io');
    log('info', 'job_rerun_triggered', { jobId, mode, briefingFile });
    emitStateUpdate(io, mode || 'marketing');

    io.to('runner').emit('pipeline:run', {
        action: 'rerun', mode: mode || 'marketing', jobId,
        content: fs.readFileSync(briefingPath, 'utf-8'),
    });

    if (process.env.OPENROUTER_API_KEY) {
        const briefingContent = fs.readFileSync(briefingPath, 'utf-8');
        log('info', 'auto_pipeline_rerun', { jobId, mode: mode || 'marketing' });
        const { startPipelineAsync } = require('./pipeline');
        startPipelineAsync(req.app, mode || 'marketing', jobId, briefingContent);
    }

    res.json({ success: true, message: 'Job reiniciado', briefingFile });
});

// API: Delete project (all files matching jobId)
router.delete('/project/:jobId', (req, res) => {
    const { jobId } = req.params;
    const { mode } = req.query;

    if (!jobId || !mode) {
        return res.status(400).json({ error: 'jobId and mode required' });
    }

    const root = getModeRoot(mode);
    const dirs = ['briefing', 'wip', 'done', 'failed'];
    let deletedCount = 0;
    const deletedFiles = [];

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

    const io = req.app.get('io');
    emitStateUpdate(io, mode);
    res.json({ success: true, jobId, mode, deletedCount, files: deletedFiles });
});

// Shareable pipeline URLs
router.get(/^\/(ideias|marketing|projetos)\/(.+)$/, (req, res) => {
    res.sendFile(path.join(__dirname, '..', '..', 'public', 'index.html'));
});

module.exports = router;
