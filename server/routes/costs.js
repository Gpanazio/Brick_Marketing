const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const CONFIG = require('../../config/constants');
const { HISTORY_ROOT } = require('../helpers/paths');
const { query } = require('../helpers/db');
const { log } = require('../helpers/logger');

// API: Estimativa de custo do pipeline (static, no DB needed)
router.get('/estimate', (req, res) => {
    const mode = req.query.mode || 'marketing';

    const pipelines = {
        marketing: [
            { name: 'VALIDATOR', model: 'flash' },
            { name: 'AUDIENCE', model: 'flash' },
            { name: 'RESEARCH', model: 'flash' },
            { name: 'CLAIMS', model: 'flash' },
            { name: 'COPYWRITER', model: 'gpt', label: 'Copy A (GPT)' },
            { name: 'COPYWRITER', model: 'flash', label: 'Copy B (Flash)' },
            { name: 'COPYWRITER', model: 'sonnet', label: 'Copy C (Sonnet)' },
            { name: 'COPY_SENIOR', model: 'gpt' },
            { name: 'WALL', model: 'opus' }
        ],
        projetos: [
            { name: 'BRAND_DIGEST', model: 'flash' },
            { name: 'CREATIVE_IDEATION', model: 'gpt', label: 'Ideation A (GPT)' },
            { name: 'CREATIVE_IDEATION', model: 'flash', label: 'Ideation B (Flash)' },
            { name: 'CREATIVE_IDEATION', model: 'sonnet', label: 'Ideation C (Sonnet)' },
            { name: 'CONCEPT_CRITIC', model: 'pro' },
            { name: 'EXECUTION_DESIGN', model: 'pro' },
            { name: 'PROPOSAL_WRITER', model: 'gpt' },
            { name: 'PROJECT_DIRECTOR', model: 'pro' }
        ],
        ideias: [
            { name: 'PAIN_CHECK', model: 'flash' },
            { name: 'MARKET_SCAN', model: 'flash' },
            { name: 'ANGEL_GEN', model: 'sonnet', label: 'Angel (Sonnet)' },
            { name: 'DEVIL_GEN', model: 'sonnet', label: 'Devil (Sonnet)' },
            { name: 'VIABILITY', model: 'opus' }
        ]
    };

    const steps = pipelines[mode] || pipelines.marketing;
    const outputCosts = CONFIG.MODEL_COSTS_OUTPUT || {};
    const inputCosts = CONFIG.MODEL_COSTS_INPUT || {};
    const avgOutputTokens = CONFIG.AVG_TOKENS_PER_STEP || {};
    const avgInputTokens = CONFIG.AVG_INPUT_TOKENS_PER_STEP || {};

    let totalCost = 0;
    const breakdown = steps.map(step => {
        const outTokens = avgOutputTokens[step.name] || 800;
        const inTokens = avgInputTokens[step.name] || 2000;
        const outCostPer1K = outputCosts[step.model] || 0.01;
        const inCostPer1K = inputCosts[step.model] || 0.001;
        const outCost = (outTokens / 1000) * outCostPer1K;
        const inCost = (inTokens / 1000) * inCostPer1K;
        const cost = outCost + inCost;
        totalCost += cost;
        return {
            step: step.label || step.name,
            model: step.model,
            inputTokens: inTokens,
            outputTokens: outTokens,
            cost: cost.toFixed(4)
        };
    });

    res.json({
        mode,
        steps: steps.length,
        totalCost: totalCost.toFixed(2),
        breakdown,
        note: 'Estimativa inclui input + output tokens. Custo real pode variar ±30%.'
    });
});

// API: Get real costs for a specific job
router.get('/costs/:jobId', async (req, res) => {
    const { jobId } = req.params;
    const mode = req.query.mode || null;

    try {
        let result;
        if (mode) {
            result = await query(
                `SELECT report FROM cost_reports WHERE job_id = $1 AND mode = $2 LIMIT 1`,
                [jobId, mode]
            );
        } else {
            result = await query(
                `SELECT report FROM cost_reports WHERE job_id = $1 LIMIT 1`,
                [jobId]
            );
        }

        if (result.rows.length > 0) {
            return res.json(result.rows[0].report);
        }
    } catch (dbErr) {
        log('warn', 'costs_db_read_failed', { error: dbErr.message });
    }

    // Fallback to filesystem
    const modesToSearch = mode ? [mode] : ['marketing', 'projetos', 'ideias', 'originais'];
    for (const m of modesToSearch) {
        const costFile = path.join(HISTORY_ROOT, m, 'wip', `${jobId}_COSTS.json`);
        if (fs.existsSync(costFile)) {
            try {
                const report = JSON.parse(fs.readFileSync(costFile, 'utf-8'));
                return res.json(report);
            } catch (e) {
                return res.status(500).json({ error: 'Failed to parse cost report' });
            }
        }
    }

    res.status(404).json({ error: 'Cost report not found', jobId });
});

// API: List all cost reports
router.get('/costs', async (req, res) => {
    const mode = req.query.mode || null;

    try {
        let result;
        if (mode) {
            result = await query(
                `SELECT job_id, mode, total_cost AS total_cost_usd, total_tokens, total_steps, completed_at
                 FROM cost_reports WHERE mode = $1 ORDER BY completed_at DESC`,
                [mode]
            );
        } else {
            result = await query(
                `SELECT job_id, mode, total_cost AS total_cost_usd, total_tokens, total_steps, completed_at
                 FROM cost_reports ORDER BY completed_at DESC`
            );
        }

        if (result.rows.length > 0) {
            return res.json({ reports: result.rows, count: result.rows.length });
        }
    } catch (dbErr) {
        log('warn', 'costs_list_db_failed', { error: dbErr.message });
    }

    // Fallback to filesystem
    const modesToSearch = mode ? [mode] : ['marketing', 'projetos', 'ideias', 'originais'];
    const reports = [];

    for (const m of modesToSearch) {
        const wipDir = path.join(HISTORY_ROOT, m, 'wip');
        if (!fs.existsSync(wipDir)) continue;

        const costFiles = fs.readdirSync(wipDir).filter(f => f.endsWith('_COSTS.json'));
        for (const f of costFiles) {
            try {
                const report = JSON.parse(fs.readFileSync(path.join(wipDir, f), 'utf-8'));
                reports.push({
                    job_id: report.job_id,
                    mode: report.mode,
                    total_cost_usd: report.summary?.total_cost_usd,
                    total_tokens: report.summary?.total_tokens,
                    total_steps: report.summary?.total_steps,
                    completed_at: report.completed_at
                });
            } catch (e) { /* skip corrupt files */ }
        }
    }

    reports.sort((a, b) => new Date(b.completed_at || 0) - new Date(a.completed_at || 0));
    res.json({ reports, count: reports.length });
});

// API: Save cost report (called by pipeline runner)
router.post('/costs', async (req, res) => {
    const { job_id, mode, report } = req.body;

    if (!job_id || !report) {
        return res.status(400).json({ error: 'job_id and report required' });
    }

    try {
        await query(
            `INSERT INTO cost_reports (job_id, mode, report, total_cost, total_tokens, total_steps)
             VALUES ($1, $2, $3, $4, $5, $6)
             ON CONFLICT DO NOTHING`,
            [
                job_id,
                mode || 'marketing',
                JSON.stringify(report),
                report.summary?.total_cost_usd || 0,
                report.summary?.total_tokens || 0,
                report.summary?.total_steps || 0
            ]
        );
        res.json({ success: true });
    } catch (err) {
        log('error', 'cost_report_save_failed', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

module.exports = router;
