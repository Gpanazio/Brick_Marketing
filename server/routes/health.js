const express = require('express');
const router = express.Router();
const CONFIG = require('../../config/constants');
const { getMetrics } = require('../helpers/metrics');

// API: Health check (Railway uses this to verify deployment)
router.get('/health', (req, res) => {
    res.status(200).json({
        status: 'online',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        port: process.env.PORT || 3000,
        node: process.version
    });
});

// API: Métricas do pipeline
router.get('/metrics', (req, res) => {
    const metrics = getMetrics();
    const pipelineStats = {};
    for (const [bot, data] of Object.entries(metrics.pipeline)) {
        pipelineStats[bot] = {
            ...data,
            avgMs: data.runs > 0 ? Math.round(data.totalMs / data.runs) : 0,
            successRate: data.runs > 0 ? Math.round((data.success / data.runs) * 100) : 0
        };
    }
    res.json({
        uptime: metrics.startedAt,
        requests: metrics.requests,
        pipeline: pipelineStats,
        thresholds: CONFIG.THRESHOLDS
    });
});

// API: Config (read-only, expõe thresholds e models)
router.get('/config', (req, res) => {
    res.json({
        thresholds: CONFIG.THRESHOLDS,
        models: CONFIG.MODELS,
        paths: CONFIG.PATHS
    });
});

module.exports = router;
