const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { log } = require('../helpers/logger');
const { getModeRoot, getFiles, getRevisions, HISTORY_ROOT } = require('../helpers/paths');

// API: Get all state (including failed, revisions, pending feedbacks)
router.get('/state', (req, res) => {
    const mode = req.query.mode || 'marketing';
    const root = getModeRoot(mode);
    const feedbackDir = path.join(root, 'feedback');

    // Pending feedbacks (status === 'pending')
    let pendingFeedbacks = [];
    if (fs.existsSync(feedbackDir)) {
        pendingFeedbacks = fs.readdirSync(feedbackDir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                try { return JSON.parse(fs.readFileSync(path.join(feedbackDir, f), 'utf-8')); }
                catch (e) { return null; }
            })
            .filter(f => f && f.status === 'pending')
            .map(f => ({ jobId: f.jobId || f.file, text: f.text || f.feedback, timestamp: f.timestamp }));
    }

    res.json({
        mode,
        briefing: getFiles('briefing', mode),
        wip: getFiles('wip', mode),
        done: getFiles('done', mode),
        failed: getFiles('failed', mode),
        revisions: getRevisions(mode),
        pendingFeedbacks
    });
});

// API: Get pending briefings (for watcher)
router.get('/pending', (req, res) => {
    const mode = req.query.mode || 'marketing';
    const allBriefings = getFiles('briefing', mode);
    const root = getModeRoot(mode);
    const wipDir = path.join(root, 'wip');

    // Filtrar apenas briefings que NÃO têm arquivos processados no wip/
    const pending = allBriefings.filter(briefing => {
        // Extrair jobId do filename (pattern: {jobId}_{nome}.md ou {jobId}.md)
        const match = briefing.name.match(/^(\d+)/);
        if (!match) return false;

        const jobId = match[1];

        // Verificar se existe QUALQUER arquivo do job no wip/
        if (!fs.existsSync(wipDir)) return true; // Se wip não existe, tá pendente

        const wipFiles = fs.readdirSync(wipDir);
        const hasWipFiles = wipFiles.some(f => f.startsWith(jobId));

        return !hasWipFiles; // Só retorna se NÃO tem arquivo no wip
    });

    res.json({ briefings: pending });
});

// API: Get history
router.get('/history', (req, res) => {
    if (!fs.existsSync(HISTORY_ROOT)) {
        return res.json({ history: [] });
    }
    const files = fs.readdirSync(HISTORY_ROOT).filter(f => !f.startsWith('.')).map(f => ({
        name: f,
        content: fs.readFileSync(path.join(HISTORY_ROOT, f), 'utf-8'),
        mtime: fs.statSync(path.join(HISTORY_ROOT, f)).mtime.toISOString()
    }));
    files.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    res.json({ history: files });
});

// API: Squad Architecture (read-only)
router.get('/architecture', (req, res) => {
    // Tenta vários caminhos possíveis
    const baseDir = path.join(__dirname, '..', '..');
    const possiblePaths = [
        path.join(baseDir, 'SQUAD_ARCHITECTURE.md'),
        path.join(process.cwd(), 'SQUAD_ARCHITECTURE.md'),
        path.join(baseDir, '..', 'SQUAD_ARCHITECTURE.md')
    ];

    let content = null;
    let usedPath = null;

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            content = fs.readFileSync(p, 'utf-8');
            usedPath = p;
            break;
        }
    }

    if (!content) {
        log('error', 'architecture_not_found', { searchedPaths: possiblePaths });
        return res.status(404).json({ error: 'SQUAD_ARCHITECTURE.md not found', searched: possiblePaths });
    }

    res.json({ content });
});

module.exports = router;
