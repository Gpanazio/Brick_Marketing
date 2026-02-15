const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { log } = require('../helpers/logger');
const { getModeRoot } = require('../helpers/paths');
const { emitStateUpdate } = require('../helpers/socket');
const { notifyTelegram, notifyDouglas } = require('../helpers/notifications');
const { upload } = require('../helpers/upload');
const { query, ensureProject, savePipelineFile } = require('../helpers/db');

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

        // Write to filesystem (backward compat)
        fs.writeFileSync(path.join(briefingDir, filename), fileContent);

        // Write to database
        try {
            await ensureProject(jobId, mode || 'marketing', title, 'briefing');
            await savePipelineFile(jobId, mode || 'marketing', 'briefing', filename, fileContent);
        } catch (dbErr) {
            log('warn', 'briefing_db_write_failed', { error: dbErr.message, jobId });
        }

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
router.post('/briefing/clear', async (req, res) => {
    try {
        const { filename, mode } = req.body || {};
        const root = getModeRoot(mode || 'marketing');

        if (!filename) {
            // Clear ALL briefings
            const briefingDir = path.join(root, 'briefing');
            let cleared = 0;
            if (fs.existsSync(briefingDir)) {
                const files = fs.readdirSync(briefingDir);
                files.forEach(f => {
                    fs.unlinkSync(path.join(briefingDir, f));
                    log('info', 'briefing_cleared', { filename: f });
                });
                cleared = files.length;
            }

            // DB: delete all briefing files for this mode
            try {
                await query(`DELETE FROM pipeline_files WHERE mode = $1 AND category = 'briefing'`, [mode || 'marketing']);
            } catch (dbErr) {
                log('warn', 'briefing_clear_db_failed', { error: dbErr.message });
            }

            const io = req.app.get('io');
            emitStateUpdate(io, mode || 'marketing');
            return res.json({ success: true, cleared });
        }

        // Clear specific file
        const filePath = path.join(root, 'briefing', filename);
        if (fs.existsSync(filePath)) {
            fs.unlinkSync(filePath);
        }

        // DB: delete specific file
        try {
            await query(`DELETE FROM pipeline_files WHERE mode = $1 AND category = 'briefing' AND filename = $2`, [mode || 'marketing', filename]);
        } catch (dbErr) {
            log('warn', 'briefing_clear_db_failed', { error: dbErr.message });
        }

        log('info', 'briefing_cleared', { filename });
        const io = req.app.get('io');
        emitStateUpdate(io, mode || 'marketing');
        res.json({ success: true });
    } catch (err) {
        log('error', 'briefing_clear_failed', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// API: Clean old briefings (keep only specified jobIds)
router.post('/briefings/cleanup', async (req, res) => {
    const { mode, keepJobIds } = req.body;
    const root = getModeRoot(mode || 'marketing');
    const briefingDir = path.join(root, 'briefing');

    let deleted = 0;

    // Filesystem cleanup
    if (fs.existsSync(briefingDir)) {
        const keepSet = new Set(keepJobIds || []);
        const files = fs.readdirSync(briefingDir).filter(f => f.endsWith('.md'));
        files.forEach(file => {
            const jobId = file.replace(/\.md$/, '').split('_')[0];
            if (!keepSet.has(jobId)) {
                fs.unlinkSync(path.join(briefingDir, file));
                deleted++;
                log('info', 'briefing_cleaned', { file, jobId, mode: mode || 'marketing' });
            }
        });
    }

    // DB cleanup
    if (keepJobIds && keepJobIds.length > 0) {
        try {
            await query(
                `DELETE FROM pipeline_files
                 WHERE mode = $1 AND category = 'briefing'
                 AND job_id NOT IN (SELECT unnest($2::text[]))`,
                [mode || 'marketing', keepJobIds]
            );
        } catch (dbErr) {
            log('warn', 'briefing_cleanup_db_failed', { error: dbErr.message });
        }
    }

    const io = req.app.get('io');
    emitStateUpdate(io, mode || 'marketing');
    res.json({ success: true, deleted, kept: (keepJobIds || []).length });
});

module.exports = router;
