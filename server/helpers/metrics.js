const fs = require('fs');
const path = require('path');

// Métricas em memória (persiste em arquivo a cada 5min)
const METRICS_FILE = path.join(__dirname, '..', '..', '.metrics.json');
let metrics = {
    pipeline: {},
    requests: { total: 0, success: 0, failed: 0 },
    startedAt: new Date().toISOString()
};

function loadMetrics() {
    try {
        if (fs.existsSync(METRICS_FILE)) {
            metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
        }
    } catch (e) { /* ignore */ }
}

function saveMetrics() {
    try {
        fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
    } catch (e) { /* ignore */ }
}

function trackStep(botName, success, durationMs, model = null) {
    if (!metrics.pipeline[botName]) {
        metrics.pipeline[botName] = { runs: 0, success: 0, failed: 0, totalMs: 0, fallbacks: 0 };
    }
    metrics.pipeline[botName].runs++;
    metrics.pipeline[botName].totalMs += durationMs;
    if (success) metrics.pipeline[botName].success++;
    else metrics.pipeline[botName].failed++;
    if (model && model.includes('gemini') && botName === 'copywriter') {
        metrics.pipeline[botName].fallbacks++;
    }
}

function getMetrics() {
    return metrics;
}

module.exports = { loadMetrics, saveMetrics, trackStep, getMetrics };
