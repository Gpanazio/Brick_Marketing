const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { log } = require('../helpers/logger');
const { getModeRoot } = require('../helpers/paths');

// Model mapping per pipeline variant
const MODEL_MAP = {
    marketing: {
        A: { label: 'GPT', model: 'openai/gpt-5.1', style: 'Direto e persuasivo' },
        B: { label: 'DeepSeek', model: 'deepseek/deepseek-v3.2', style: 'Eficiente e data-driven' },
        C: { label: 'Sonnet', model: 'anthropic/claude-sonnet-4.5', style: 'Narrativo e emocional' }
    },
    projetos: {
        A: { label: 'GPT', model: 'openai/gpt-5.1', style: 'Conceito A' },
        B: { label: 'Flash', model: 'gemini-3-flash-preview', style: 'Conceito B' },
        C: { label: 'Sonnet', model: 'anthropic/claude-sonnet-4.5', style: 'Conceito C' }
    }
};

// Scan COPY_SENIOR / CONCEPT_CRITIC files for winner data
function scanWinnersFromFS(mode) {
    const root = getModeRoot(mode);
    const winners = [];
    const dirs = ['wip', 'done', 'history'];

    for (const dir of dirs) {
        const dirPath = path.join(root, dir);
        if (!fs.existsSync(dirPath)) continue;

        const files = fs.readdirSync(dirPath);
        const targetFiles = mode === 'marketing'
            ? files.filter(f => f.includes('COPY_SENIOR') && f.endsWith('.json') && !f.includes('_v'))
            : files.filter(f => f.includes('CONCEPT_CRITIC') && f.endsWith('.json') && !f.includes('_v'));

        for (const file of targetFiles) {
            try {
                const content = fs.readFileSync(path.join(dirPath, file), 'utf-8');
                let clean = content.trim();
                if (clean.startsWith('```json')) clean = clean.replace(/^```json\n?/, '').replace(/```$/, '');
                if (clean.startsWith('```')) clean = clean.replace(/^```\n?/, '').replace(/```$/, '');
                const parsed = JSON.parse(clean);

                const jobId = file.match(/^(\d{10,})/)?.[1] || file.split('_')[0];
                const winner = parsed.vencedor || parsed.winner || parsed.best || null;
                const score = parsed.score_vencedor || parsed.score || null;
                const justificativa = parsed.justificativa || parsed.reason || null;

                if (winner) {
                    winners.push({
                        jobId,
                        winner: winner.toUpperCase(),
                        score,
                        justificativa,
                        mode,
                        source: `${dir}/${file}`,
                        timestamp: parsed.timestamp || null
                    });
                }
            } catch (e) {
                // Skip unparseable files
            }
        }
    }

    return winners;
}

// Also scan from DB if available
async function scanWinnersFromDB(mode) {
    try {
        const { query } = require('../helpers/db');
        const step = mode === 'marketing' ? 'COPY_SENIOR' : 'CONCEPT_CRITIC';

        const result = await query(
            `SELECT pf.job_id, pf.content, pf.created_at, pf.model
             FROM pipeline_files pf
             WHERE pf.mode = $1
               AND pf.filename LIKE $2
               AND pf.filename NOT LIKE '%_v%'
             ORDER BY pf.created_at DESC`,
            [mode, `%${step}%`]
        );

        return result.rows.map(row => {
            try {
                let clean = (row.content || '').trim();
                if (clean.startsWith('```json')) clean = clean.replace(/^```json\n?/, '').replace(/```$/, '');
                if (clean.startsWith('```')) clean = clean.replace(/^```\n?/, '').replace(/```$/, '');
                const parsed = JSON.parse(clean);
                const winner = parsed.vencedor || parsed.winner || parsed.best || null;
                return winner ? {
                    jobId: row.job_id,
                    winner: winner.toUpperCase(),
                    score: parsed.score_vencedor || parsed.score || null,
                    justificativa: parsed.justificativa || parsed.reason || null,
                    mode,
                    model: row.model,
                    timestamp: row.created_at
                } : null;
            } catch (e) {
                return null;
            }
        }).filter(Boolean);
    } catch (e) {
        return [];
    }
}

// API: Get ranking data
router.get('/ranking', async (req, res) => {
    const modes = ['marketing', 'projetos'];
    const ranking = {};

    for (const mode of modes) {
        // Merge filesystem + DB results, dedupe by jobId
        const fsWinners = scanWinnersFromFS(mode);
        const dbWinners = await scanWinnersFromDB(mode);

        const seen = new Set();
        const allWinners = [];

        // DB first (more reliable)
        for (const w of [...dbWinners, ...fsWinners]) {
            if (!seen.has(w.jobId)) {
                seen.add(w.jobId);
                allWinners.push(w);
            }
        }

        // Tally
        const tally = { A: 0, B: 0, C: 0 };
        const details = [];

        allWinners.forEach(w => {
            const variant = w.winner.charAt(0); // Get first char (A, B, or C)
            if (tally.hasOwnProperty(variant)) {
                tally[variant]++;
            }
            details.push(w);
        });

        const total = tally.A + tally.B + tally.C;
        const models = MODEL_MAP[mode] || {};

        ranking[mode] = {
            total,
            tally,
            percentages: {
                A: total > 0 ? ((tally.A / total) * 100).toFixed(1) : 0,
                B: total > 0 ? ((tally.B / total) * 100).toFixed(1) : 0,
                C: total > 0 ? ((tally.C / total) * 100).toFixed(1) : 0
            },
            models,
            details: details.sort((a, b) => new Date(b.timestamp || 0) - new Date(a.timestamp || 0))
        };
    }

    res.json(ranking);
});

module.exports = router;
