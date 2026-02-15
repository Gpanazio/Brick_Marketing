const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { log } = require('../helpers/logger');
const { getModeRoot, MARKETING_ROOT, PROJETOS_ROOT } = require('../helpers/paths');
const { emitStateUpdate } = require('../helpers/socket');
const { notifyDouglas } = require('../helpers/notifications');

// Feedback route - recebe feedback humano e salva para processamento
router.post('/feedback', async (req, res) => {
    // Support both old format (file, action, type, text) and new format (jobId, feedback)
    const { file, action, type, text, routedTo, mode, jobId, feedback } = req.body;
    const timestamp = Date.now();

    const baseDir = mode === 'projetos' ? PROJETOS_ROOT : MARKETING_ROOT;
    const feedbackDir = path.join(baseDir, 'feedback');
    const historyDir = path.join(baseDir, 'history');
    if (!fs.existsSync(feedbackDir)) fs.mkdirSync(feedbackDir, { recursive: true });
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

    // Archive current version before feedback
    if (file) {
        const currentFile = path.join(baseDir, 'wip', file);
        if (fs.existsSync(currentFile)) {
            const ext = path.extname(file);
            const base = path.basename(file, ext);
            const historyFile = path.join(historyDir, `${base}_${timestamp}${ext}`);
            fs.copyFileSync(currentFile, historyFile);
            log('info', 'version_archived', { original: file, archived: historyFile });
        }
    }

    const feedbackData = {
        timestamp: new Date().toISOString(),
        jobId: jobId || file,
        file,
        action: action || 'revision',
        type: type || 'human_feedback',
        text: text || feedback,
        routedTo,
        mode,
        status: 'pending'
    };

    const feedbackFile = path.join(feedbackDir, `${timestamp}_feedback.json`);
    fs.writeFileSync(feedbackFile, JSON.stringify(feedbackData, null, 2));

    // Create signal file for Douglas to pick up
    const signalFile = path.join(baseDir, 'FEEDBACK_SIGNAL.txt');
    fs.writeFileSync(signalFile, `FEEDBACK PENDENTE\nJobID: ${jobId || file}\nTexto: ${text || feedback}\nTimestamp: ${new Date().toISOString()}`);

    // Notify Douglas
    const notifyData = {
        jobId: jobId || file,
        mode: mode || 'marketing',
        feedbackAction: action || 'revision',
        feedbackType: type || 'human_feedback',
        feedbackText: text || feedback
    };
    await notifyDouglas(notifyData);

    const io = req.app.get('io');

    log('info', 'feedback_received', { jobId, feedback: text || feedback, mode });
    emitStateUpdate(io, mode || 'marketing');

    // Socket.IO: notificar runner
    io.to('runner').emit('pipeline:run', {
        action: 'feedback',
        mode: mode || 'marketing',
        jobId: jobId || file,
        target: routedTo || 'PROPOSAL',
        content: text || feedback,
    });

    // NOVO: Disparar pipeline autônomo com feedback integrado
    if (process.env.OPENROUTER_API_KEY) {
        const effectiveMode = mode || 'marketing';
        const effectiveJobId = jobId || file;
        const feedbackText = text || feedback;

        // Buscar briefing original
        const baseDir2 = getModeRoot(effectiveMode);
        const briefingDir2 = path.join(baseDir2, 'briefing');
        const wipDir2 = path.join(baseDir2, 'wip');
        let originalBriefing = '';

        // Tentar achar briefing original
        if (fs.existsSync(briefingDir2)) {
            const bf = fs.readdirSync(briefingDir2).find(f => f.includes(effectiveJobId));
            if (bf) originalBriefing = fs.readFileSync(path.join(briefingDir2, bf), 'utf-8');
        }

        // Juntar briefing + contexto existente + feedback
        let previousResults = '';
        if (fs.existsSync(wipDir2)) {
            const wipFiles = fs.readdirSync(wipDir2).filter(f => f.includes(effectiveJobId) && !f.includes('BRIEFING'));
            wipFiles.forEach(wf => {
                try {
                    const content = fs.readFileSync(path.join(wipDir2, wf), 'utf-8');
                    previousResults += `\n\n## ${wf}\n${content.substring(0, 500)}`;
                } catch (e) { }
            });
        }

        const enrichedBriefing = `# BRIEFING ORIGINAL\n${originalBriefing}\n\n# RESULTADO ANTERIOR\n${previousResults}\n\n# FEEDBACK HUMANO\n${feedbackText}\n\n---\nINSTRUÇÃO: Refaça o pipeline levando em consideração o feedback humano acima.`;

        // Re-run no mesmo jobId (gera arquivos que sobrescrevem os anteriores)
        log('info', 'auto_pipeline_feedback', { jobId: effectiveJobId, mode: effectiveMode });
        const { startPipelineAsync } = require('./pipeline');
        startPipelineAsync(req.app, effectiveMode, effectiveJobId, enrichedBriefing);
    }

    res.json({ success: true, saved: feedbackFile, archived: true });
});

// Get pending feedbacks
router.get('/feedback', (req, res) => {
    const mode = req.query.mode || 'marketing';
    const baseDir = mode === 'projetos' ? PROJETOS_ROOT : MARKETING_ROOT;
    const feedbackDir = path.join(baseDir, 'feedback');

    if (!fs.existsSync(feedbackDir)) {
        return res.json({ pending: [] });
    }

    const files = fs.readdirSync(feedbackDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            const content = JSON.parse(fs.readFileSync(path.join(feedbackDir, f), 'utf-8'));
            return { filename: f, ...content };
        })
        .filter(f => f.status === 'pending');

    res.json({ pending: files });
});

// Approval endpoint (from War Room UI)
router.post('/approve', async (req, res) => {
    const { jobId, mode, timestamp } = req.body;
    const ts = Date.now();

    const baseDir = mode === 'projetos' ? PROJETOS_ROOT : MARKETING_ROOT;
    const approvalDir = path.join(baseDir, 'approved');
    const wipDir = path.join(baseDir, 'wip');
    const doneDir = path.join(baseDir, 'done');

    if (!fs.existsSync(approvalDir)) fs.mkdirSync(approvalDir, { recursive: true });
    if (!fs.existsSync(doneDir)) fs.mkdirSync(doneDir, { recursive: true });

    // Move all project files from wip/ to done/
    const movedFiles = [];
    if (fs.existsSync(wipDir)) {
        const files = fs.readdirSync(wipDir).filter(f => f.startsWith(jobId));
        files.forEach(file => {
            const srcPath = path.join(wipDir, file);
            const destPath = path.join(doneDir, file);
            fs.renameSync(srcPath, destPath);
            movedFiles.push(file);
        });
    }

    const approval = {
        timestamp: timestamp || new Date().toISOString(),
        jobId,
        mode,
        status: 'approved',
        approvedBy: 'human',
        filesMovedToDone: movedFiles.length
    };

    const approvalFile = path.join(approvalDir, `${jobId}_APPROVED_${ts}.json`);
    fs.writeFileSync(approvalFile, JSON.stringify(approval, null, 2));

    const io = req.app.get('io');
    log('info', 'campaign_approved', { jobId, mode, filesMoved: movedFiles.length });
    emitStateUpdate(io, mode || 'marketing');
    res.json({ success: true, saved: approvalFile, filesMoved: movedFiles.length });
});

module.exports = router;
