const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { log } = require('../helpers/logger');
const { getModeRoot } = require('../helpers/paths');
const { emitStateUpdate } = require('../helpers/socket');
const { notifyTelegram, notifyDouglas } = require('../helpers/notifications');
const { upload } = require('../helpers/upload');

// API: Create Briefing (from dashboard) - supports file uploads
router.post('/briefing', upload.array('files', 10), async (req, res) => {
    try {
        const { title, content, mode } = req.body;
        if (!title) return res.status(400).json({ error: 'Título obrigatório' });

        const root = getModeRoot(mode || 'marketing');
        const timestamp = Date.now();
        const safeName = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
        const jobId = `${timestamp}_${safeName}`;
        const filename = `${jobId}.md`;
        const briefingDir = path.join(root, 'briefing');

        if (!fs.existsSync(briefingDir)) fs.mkdirSync(briefingDir, { recursive: true });

        let fileContent = `# ${title}\n\n`;
        fileContent += `**Criado em:** ${new Date().toISOString()}\n`;
        fileContent += `**Modo:** ${mode || 'marketing'}\n`;
        fileContent += `**Job ID:** ${jobId}\n\n`;
        fileContent += `## Descrição\n${content || '(sem descrição)'}\n\n`;

        // Process uploaded files
        const uploadedFiles = req.files || [];
        if (uploadedFiles.length > 0) {
            fileContent += `## Anexos (${uploadedFiles.length} arquivo(s))\n`;
            fileContent += `> ⚠️ Douglas precisa processar esses anexos antes de passar pro squad.\n\n`;

            const attachmentsDir = path.join(root, 'attachments', jobId);
            if (!fs.existsSync(attachmentsDir)) fs.mkdirSync(attachmentsDir, { recursive: true });

            uploadedFiles.forEach((file, i) => {
                const destPath = path.join(attachmentsDir, file.originalname);
                fs.renameSync(file.path, destPath);
                fileContent += `${i + 1}. ${file.originalname} (${(file.size / 1024).toFixed(1)}KB)\n`;
                log('info', 'briefing_file_attached', { filename: file.originalname, size: file.size, jobId });
            });
            fileContent += '\n';
        }

        fs.writeFileSync(path.join(briefingDir, filename), fileContent);
        log('info', 'briefing_created', { filename, mode: mode || 'marketing', filesCount: uploadedFiles.length, jobId });

        const io = req.app.get('io');
        emitStateUpdate(io, mode || 'marketing');

        const briefingData = {
            title,
            mode: mode || 'marketing',
            filesCount: uploadedFiles.length,
            jobId
        };

        await notifyDouglas(briefingData);

        const emoji = mode === 'projetos' ? '🎬' : '🚨';
        const typeLabel = mode === 'projetos' ? 'NOVO PROJETO DE CLIENTE' : 'NOVO BRIEFING';
        const telegramMsg = `${emoji} ${typeLabel}!\n\n📋 *${title}*\n📁 Modo: ${mode || 'marketing'}\n${uploadedFiles.length > 0 ? `📎 ${uploadedFiles.length} anexo(s)\n` : ''}🆔 Job: ${jobId}`;
        await notifyTelegram(telegramMsg);

        // Auto-start pipeline if OpenRouter is configured
        if (process.env.OPENROUTER_API_KEY) {
            const { startPipelineAsync } = require('./pipeline');
            startPipelineAsync(req.app, mode || 'marketing', jobId, fileContent);
        }

        res.json({ success: true, filename, mode: mode || 'marketing', filesCount: uploadedFiles.length });
    } catch (err) {
        log('error', 'briefing_create_failed', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// API: Clear briefing after processing
router.post('/briefing/clear', (req, res) => {
    try {
        const { filename, mode } = req.body || {};
        const root = getModeRoot(mode || 'marketing');

        // Se não passar filename, limpa TUDO
        if (!filename) {
            const briefingDir = path.join(root, 'briefing');
            if (fs.existsSync(briefingDir)) {
                const files = fs.readdirSync(briefingDir);
                files.forEach(f => {
                    fs.unlinkSync(path.join(briefingDir, f));
                    log('info', 'briefing_cleared', { filename: f });
                });
                const io = req.app.get('io');
                emitStateUpdate(io, mode || 'marketing');
                return res.json({ success: true, cleared: files.length });
            }
            return res.json({ success: true, cleared: 0 });
        }

        // Limpar arquivo específico
        const filePath = path.join(root, 'briefing', filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
            log('info', 'briefing_cleared', { filename });
            const io = req.app.get('io');
            emitStateUpdate(io, mode || 'marketing');
            res.json({ success: true });
        } else {
            res.status(404).json({ error: 'File not found' });
        }
    } catch (err) {
        log('error', 'briefing_clear_failed', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// API: Clean old briefings (keep only specified jobIds)
router.post('/briefings/cleanup', (req, res) => {
    const { mode, keepJobIds } = req.body;
    const root = getModeRoot(mode || 'marketing');
    const briefingDir = path.join(root, 'briefing');

    if (!fs.existsSync(briefingDir)) {
        return res.status(404).json({ error: 'Briefing directory not found' });
    }

    const keepSet = new Set(keepJobIds || []);
    const files = fs.readdirSync(briefingDir).filter(f => f.endsWith('.md'));
    let deleted = 0;

    files.forEach(file => {
        const jobId = file.replace(/\.md$/, '').split('_')[0];
        if (!keepSet.has(jobId)) {
            const filePath = path.join(briefingDir, file);
            fs.unlinkSync(filePath);
            deleted++;
            log('info', 'briefing_cleaned', { file, jobId, mode: mode || 'marketing' });
        }
    });

    const io = req.app.get('io');
    emitStateUpdate(io, mode || 'marketing');
    res.json({ success: true, deleted, kept: keepSet.size });
});

module.exports = router;
