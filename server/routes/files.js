const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { log } = require('../helpers/logger');
const { getModeRoot } = require('../helpers/paths');
const { sanitizePath } = require('../middleware/security');
const { emitStateUpdate } = require('../helpers/socket');
const { trackStep } = require('../helpers/metrics');
const { getMetrics } = require('../helpers/metrics');
const { schemas, validate, getBotNameFromFilename } = require('../../contracts/schemas');

// API: Submit result from agent (com validação de schema)
router.post('/result', (req, res) => {
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

            // Get the bot/step name from filename
            const detectedBot = botName || getBotNameFromFilename(filename);

            if (detectedBot && schemas[detectedBot]) {
                const validation = validate(detectedBot, parsed);
                if (!validation.valid) {
                    log('warn', 'schema_validation_failed', {
                        filename,
                        bot: detectedBot,
                        errors: validation.errors
                    });
                    return res.status(400).json({
                        error: 'Schema validation failed',
                        bot: detectedBot,
                        errors: validation.errors
                    });
                }
            }
        } catch (e) {
            log('warn', 'json_parse_failed', { filename, error: e.message });
        }
    }

    if (botName && durationMs) {
        trackStep(botName, true, durationMs, model);
    }

    fs.writeFileSync(filePath, content);
    log('info', 'result_submitted', { filename, category: targetCategory, botName, mode: mode || 'marketing' });
    const metrics = getMetrics();
    metrics.requests.total++;
    metrics.requests.success++;
    const io = req.app.get('io');
    emitStateUpdate(io, mode || 'marketing');
    res.json({ success: true, filename, category: targetCategory });
});

// API: Move File (Approve/Reject)
router.post('/move', (req, res) => {
    const { filename, from, to, mode } = req.body;

    // SECURITY: Sanitize paths
    const safeFilename = sanitizePath(filename);
    const safeFrom = sanitizePath(from);
    const safeTo = sanitizePath(to);

    if (!safeFilename || !safeFrom || !safeTo) {
        return res.status(400).json({ error: 'Invalid path detected' });
    }

    const root = getModeRoot(mode || 'marketing');
    const srcPath = path.join(root, safeFrom, safeFilename);
    const destPath = path.join(root, safeTo, safeFilename);

    // Ensure destination directory exists
    const destDir = path.dirname(destPath);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    if (fs.existsSync(srcPath)) {
        fs.renameSync(srcPath, destPath);
        log('info', 'file_moved', { filename, from: safeFrom, to: safeTo, mode: mode || 'marketing' });
        const io = req.app.get('io');
        emitStateUpdate(io, mode || 'marketing');
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: Delete File
router.delete('/file', (req, res) => {
    const { category, filename, mode } = req.body;

    // SECURITY: Sanitize paths
    const safeCategory = sanitizePath(category);
    const safeFilename = sanitizePath(filename);

    if (!safeCategory || !safeFilename) {
        return res.status(400).json({ error: 'Invalid path detected' });
    }

    const root = getModeRoot(mode || 'marketing');
    const filePath = path.join(root, safeCategory, safeFilename);

    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        log('info', 'file_deleted', { filename, category: safeCategory, mode: mode || 'marketing' });
        const io = req.app.get('io');
        emitStateUpdate(io, mode || 'marketing');
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: Archive file to history
router.post('/archive', (req, res) => {
    const { filename, mode } = req.body;
    const { MARKETING_ROOT, PROJETOS_ROOT } = require('../helpers/paths');
    const baseDir = mode === 'projetos' ? PROJETOS_ROOT : MARKETING_ROOT;
    const src = path.join(baseDir, 'done', filename);
    const timestamp = new Date().toISOString().split('T')[0];
    const destFilename = `${timestamp}_${filename}`;
    const historyDir = path.join(baseDir, 'history');

    // Ensure history dir exists
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

    const dest = path.join(historyDir, destFilename);

    if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
        log('info', 'file_archived', { filename, archived: destFilename, mode });
        res.json({ success: true, archived: destFilename });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

module.exports = router;
