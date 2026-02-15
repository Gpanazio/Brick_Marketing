const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { log } = require('../helpers/logger');
const { emitStateUpdate } = require('../helpers/socket');
const { PipelineRunner, handlePipelineRun, PIPELINES } = require('../../lib/pipeline-runner');

// Track de pipelines ativos
const activePipelines = new Map();

// Função para disparar pipeline em background
function startPipelineAsync(app, mode, jobId, briefingContent) {
    if (activePipelines.has(jobId)) {
        log('warn', 'pipeline_already_running', { jobId });
        return;
    }

    const ioInstance = app.get('io');

    log('info', 'autonomous_pipeline_start', { mode, jobId });
    activePipelines.set(jobId, { status: 'running', startedAt: Date.now() });

    // Fire & forget - roda em background
    handlePipelineRun({
        briefing: briefingContent,
        mode,
        jobId,
        io: ioInstance,
        model: process.env.PIPELINE_MODEL || 'google/gemini-3-flash-preview',
        emitStateUpdate: (m) => emitStateUpdate(ioInstance, m)
    }).then(result => {
        activePipelines.set(jobId, { status: result.status, completedAt: Date.now() });
        log('info', 'autonomous_pipeline_completed', { jobId, status: result.status });
        setTimeout(() => activePipelines.delete(jobId), 3600000);
    }).catch(error => {
        activePipelines.set(jobId, { status: 'failed', error: error.message });
        log('error', 'autonomous_pipeline_error', { jobId, error: error.message });
    });
}

// API: Get pipeline configuration
router.get('/pipeline', (req, res) => {
    const mode = req.query.mode || 'marketing';
    const pipelinePath = path.join(__dirname, '..', '..', 'config', `pipeline-${mode}.json`);

    if (fs.existsSync(pipelinePath)) {
        const config = JSON.parse(fs.readFileSync(pipelinePath, 'utf-8'));
        res.json(config);
    } else {
        // Fallback to default marketing config
        const fallbackPath = path.join(__dirname, '..', '..', 'config', 'pipeline-marketing.json');
        if (fs.existsSync(fallbackPath)) {
            const config = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
            res.json(config);
        } else {
            res.status(404).json({ error: 'Pipeline config not found' });
        }
    }
});

// API: Save pipeline configuration
router.post('/pipeline', (req, res) => {
    const { nodes, mode } = req.body;
    if (!nodes) {
        return res.status(400).json({ error: 'Missing nodes config' });
    }

    const targetMode = mode || 'marketing';
    const pipelinePath = path.join(__dirname, '..', '..', 'config', `pipeline-${targetMode}.json`);

    // Determine version based on mode
    const version = targetMode === 'projetos' ? '2.0' : '3.3';

    const config = {
        nodes,
        version,
        mode: targetMode,
        lastUpdate: new Date().toISOString()
    };

    fs.writeFileSync(pipelinePath, JSON.stringify(config, null, 2));
    log('info', 'pipeline_config_updated', { mode: targetMode, nodes: Object.keys(nodes).length });
    res.json({ success: true, config });
});

// API: Run pipeline manually via POST
router.post('/run-autonomous', async (req, res) => {
    const { briefing, mode = 'marketing', model } = req.body;

    if (!briefing) {
        return res.status(400).json({ error: 'Briefing é obrigatório' });
    }

    // Gerar jobId com título (mesmo formato do frontend)
    const title = req.body.title || briefing.substring(0, 60).trim();
    const safeName = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    const jobId = `${Date.now()}_${safeName}`;
    startPipelineAsync(req.app, mode, jobId, briefing);

    res.json({ success: true, jobId, message: 'Pipeline iniciado em background' });
});

// API: Get pipeline status
router.get('/pipeline-status', (req, res) => {
    const { jobId } = req.query;
    if (jobId) {
        const status = activePipelines.get(jobId);
        return res.json(status || { status: 'not_found' });
    }
    const all = {};
    activePipelines.forEach((v, k) => { all[k] = v; });
    res.json(all);
});

// API: Get available models
router.get('/models', (req, res) => {
    const { FREE_MODELS, PAID_MODELS } = require('../../lib/openrouter-client');
    res.json({
        free: FREE_MODELS,
        paid: PAID_MODELS,
        configured: !!process.env.OPENROUTER_API_KEY,
        current: process.env.PIPELINE_MODEL || 'google/gemini-3-flash-preview'
    });
});

// API: Test OpenRouter connection
router.get('/openrouter-test', async (req, res) => {
    const { OpenRouterClient } = require('../../lib/openrouter-client');
    const client = new OpenRouterClient();

    try {
        const result = await client.chat(
            [{ role: 'user', content: 'Responda apenas: OK' }],
            'google/gemini-3-flash-preview'
        );
        res.json({ success: true, response: result });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;
module.exports.startPipelineAsync = startPipelineAsync;
