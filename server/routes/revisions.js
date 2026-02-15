const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { log } = require('../helpers/logger');
const { getModeRoot, findFileByPattern, getFeedbacksForJob } = require('../helpers/paths');
const { emitStateUpdate } = require('../helpers/socket');

router.get('/revisions/:jobId', (req, res) => {
    const { jobId } = req.params;
    const mode = req.query.mode || 'marketing';
    const root = getModeRoot(mode);
    const wipDir = path.join(root, 'wip');
    const doneDir = path.join(root, 'done');
    const feedbackDir = path.join(root, 'feedback');
    const searchDirs = [wipDir, doneDir].filter(d => fs.existsSync(d));

    let original = null, revision = null, diffFile = null;
    for (const dir of searchDirs) {
        if (!original) original = findFileByPattern(dir, jobId, 'FINAL.md');
        if (!revision) revision = findFileByPattern(dir, jobId, 'FINAL_v2.md');
        if (!diffFile) diffFile = findFileByPattern(dir, jobId, 'revision_diff.json');
    }

    const feedbacks = getFeedbacksForJob(feedbackDir, jobId);
    let diffData = null;
    if (diffFile) {
        try { diffData = JSON.parse(diffFile.content); } catch (e) { /* ignore */ }
    }

    res.json({
        jobId, mode,
        hasRevision: !!(revision || diffFile),
        original: original ? { name: original.name, content: original.content } : null,
        revision: revision ? { name: revision.name, content: revision.content } : null,
        diff: diffData,
        feedbacks: feedbacks.map(f => ({
            filename: f.filename, text: f.text || f.feedback,
            timestamp: f.timestamp, status: f.status
        }))
    });
});

router.post('/revisions/:jobId/approve', (req, res) => {
    const { jobId } = req.params;
    const { mode, revisionNumber } = req.body;
    const root = getModeRoot(mode || 'marketing');
    const wipDir = path.join(root, 'wip');
    const originalFile = findFileByPattern(wipDir, jobId, 'FINAL.md');
    const revPattern = revisionNumber ? `REVISAO_${revisionNumber}.md` : 'FINAL_v2.md';
    const v2File = findFileByPattern(wipDir, jobId, revPattern);
    const diffFile = findFileByPattern(wipDir, jobId, 'revision_diff.json');

    if (!v2File) return res.status(404).json({ error: `Revisão não encontrada: ${revPattern}` });

    try {
        const v2Path = path.join(wipDir, v2File.name);
        let backupName;
        if (revisionNumber) {
            const outputFile = findFileByPattern(wipDir, jobId, 'SOCIAL_SLICE.md') || originalFile;
            if (outputFile) {
                const outputPath = path.join(wipDir, outputFile.name);
                backupName = outputFile.name.replace('.md', `_backup_v${revisionNumber}.md`);
                fs.renameSync(outputPath, path.join(wipDir, backupName));
                fs.copyFileSync(v2Path, outputPath);
                log('info', 'revision_approved_new', { jobId, revisionNumber, backup: backupName });
            }
        } else {
            const originalPath = path.join(wipDir, originalFile.name);
            backupName = originalFile.name.replace('_FINAL.md', '_FINAL_v1_original.md');
            fs.renameSync(originalPath, path.join(wipDir, backupName));
            fs.renameSync(v2Path, originalPath);
        }

        if (diffFile) {
            const diffPath = path.join(wipDir, diffFile.name);
            const diffData = JSON.parse(diffFile.content);
            diffData.status = 'approved';
            diffData.approved_at = new Date().toISOString();
            fs.writeFileSync(diffPath, JSON.stringify(diffData, null, 2));
        }

        const feedbackDir = path.join(root, 'feedback');
        const feedbacks = getFeedbacksForJob(feedbackDir, jobId);
        feedbacks.forEach(fb => {
            if (fb.filename) {
                const fbPath = path.join(feedbackDir, fb.filename);
                if (fs.existsSync(fbPath)) {
                    const fbData = JSON.parse(fs.readFileSync(fbPath, 'utf-8'));
                    fbData.status = 'resolved';
                    fbData.resolved_at = new Date().toISOString();
                    fs.writeFileSync(fbPath, JSON.stringify(fbData, null, 2));
                }
            }
        });

        const io = req.app.get('io');
        log('info', 'revision_approved', { jobId, mode: mode || 'marketing', backup: backupName });
        emitStateUpdate(io, mode || 'marketing');
        res.json({ success: true, backup: backupName });
    } catch (err) {
        log('error', 'revision_approve_failed', { jobId, error: err.message });
        res.status(500).json({ error: err.message });
    }
});

router.post('/revisions/:jobId/reject', (req, res) => {
    const { jobId } = req.params;
    const { mode, revisionNumber } = req.body;
    const root = getModeRoot(mode || 'marketing');
    const wipDir = path.join(root, 'wip');
    const feedbackDir = path.join(root, 'feedback');
    const archivedDir = path.join(feedbackDir, 'archived');
    if (!fs.existsSync(archivedDir)) fs.mkdirSync(archivedDir, { recursive: true });

    const revPattern = revisionNumber ? `REVISAO_${revisionNumber}.md` : 'FINAL_v2.md';
    const v2File = findFileByPattern(wipDir, jobId, revPattern);
    const diffFile = findFileByPattern(wipDir, jobId, 'revision_diff.json');

    try {
        if (v2File) {
            const v2Path = path.join(wipDir, v2File.name);
            const archivedName = v2File.name.replace('.md', `_rejected_${Date.now()}.md`);
            fs.renameSync(v2Path, path.join(archivedDir, archivedName));
            log('info', 'revision_rejected', { jobId, revisionNumber, archived: archivedName });
        }
        if (diffFile) {
            const diffPath = path.join(wipDir, diffFile.name);
            const diffData = JSON.parse(diffFile.content);
            diffData.status = 'rejected';
            diffData.rejected_at = new Date().toISOString();
            fs.writeFileSync(diffPath, JSON.stringify(diffData, null, 2));
        }
        const feedbacks = getFeedbacksForJob(feedbackDir, jobId);
        feedbacks.forEach(fb => {
            if (fb.filename) {
                const src = path.join(feedbackDir, fb.filename);
                const dest = path.join(archivedDir, fb.filename);
                if (fs.existsSync(src)) fs.renameSync(src, dest);
            }
        });

        const io = req.app.get('io');
        log('info', 'revision_rejected', { jobId, mode: mode || 'marketing' });
        emitStateUpdate(io, mode || 'marketing');
        res.json({ success: true });
    } catch (err) {
        log('error', 'revision_reject_failed', { jobId, error: err.message });
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
