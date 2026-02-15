const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const CONFIG = require('../../config/constants');
const { HISTORY_ROOT } = require('../helpers/paths');

// API: Estimativa de custo do pipeline
router.get('/estimate', (req, res) => {
    const mode = req.query.mode || 'marketing';

    // Definir etapas por modo (DEVE espelhar os scripts run-*.sh)
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
router.get('/costs/:jobId', (req, res) => {
    const { jobId } = req.params;
    const mode = req.query.mode || null;

    // Search across all modes for the cost file
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
router.get('/costs', (req, res) => {
    const mode = req.query.mode || null;
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

module.exports = router;
