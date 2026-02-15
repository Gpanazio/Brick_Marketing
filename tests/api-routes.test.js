const { describe, it, before, after } = require('node:test');
const assert = require('node:assert');
const http = require('http');

// ============================================================================
// Helper: make HTTP request
// ============================================================================
function request(path, options = {}) {
    return new Promise((resolve, reject) => {
        const url = new URL(path, `http://localhost:${process.env.TEST_PORT || 3099}`);
        const req = http.get(url.toString(), { headers: options.headers || {} }, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                try {
                    resolve({ status: res.statusCode, body: JSON.parse(data), headers: res.headers });
                } catch {
                    resolve({ status: res.statusCode, body: data, headers: res.headers });
                }
            });
        });
        req.on('error', reject);
    });
}

// ============================================================================
// API Route Tests (requires server running on TEST_PORT)
// These tests verify the API contract, not the full pipeline
// Run with: TEST_PORT=3099 node --test tests/api-routes.test.js
// (server must be running separately)
// ============================================================================
describe('API Routes (smoke tests)', { skip: !process.env.TEST_PORT }, () => {
    it('GET /api/health should return 200 with status ok', async () => {
        const res = await request('/api/health');
        assert.strictEqual(res.status, 200);
        assert.strictEqual(res.body.status, 'ok');
    });

    it('GET /api/estimate should return valid breakdown', async () => {
        const res = await request('/api/estimate?mode=marketing');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.mode);
        assert.ok(res.body.steps > 0);
        assert.ok(res.body.totalCost);
        assert.ok(Array.isArray(res.body.breakdown));
    });

    it('GET /api/estimate should accept mode parameter', async () => {
        const marketing = await request('/api/estimate?mode=marketing');
        const ideias = await request('/api/estimate?mode=ideias');
        assert.strictEqual(marketing.body.mode, 'marketing');
        assert.strictEqual(ideias.body.mode, 'ideias');
    });

    it('GET /api/metrics should return valid structure', async () => {
        const res = await request('/api/metrics');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.uptime);
        assert.ok(res.body.requests !== undefined);
        assert.ok(res.body.pipeline !== undefined);
    });

    it('GET /api/costs should return reports array', async () => {
        const res = await request('/api/costs');
        assert.strictEqual(res.status, 200);
        assert.ok(Array.isArray(res.body.reports));
        assert.ok(res.body.count !== undefined);
    });

    it('GET /api/costs/:jobId should return 404 for unknown job', async () => {
        const res = await request('/api/costs/nonexistent-job-id');
        assert.strictEqual(res.status, 404);
    });

    it('GET /api/models should return model config', async () => {
        const res = await request('/api/models');
        assert.strictEqual(res.status, 200);
        assert.ok(res.body.free || res.body.paid || res.body.current);
    });
});

// ============================================================================
// Standalone unit tests (no server needed)
// ============================================================================
describe('API contract types', () => {
    it('CONFIG should have required cost fields', () => {
        const CONFIG = require('../config/constants');
        assert.ok(CONFIG.MODEL_COSTS_OUTPUT);
        assert.ok(CONFIG.MODEL_COSTS_INPUT);
        assert.ok(CONFIG.AVG_TOKENS_PER_STEP);
        assert.ok(CONFIG.AVG_INPUT_TOKENS_PER_STEP);
        assert.ok(typeof CONFIG.MODEL_COSTS_OUTPUT.flash === 'number');
        assert.ok(typeof CONFIG.MODEL_COSTS_INPUT.flash === 'number');
    });

    it('CONFIG costs should use Gemini 3 Flash pricing', () => {
        const CONFIG = require('../config/constants');
        // Gemini 3 Flash: $0.50/1M input, $3.00/1M output
        // In constants.js these are per 1K tokens (divided by 1000)
        assert.ok(CONFIG.MODEL_COSTS_OUTPUT.flash >= 0.001, 'Flash output cost should reflect Gemini 3 pricing');
        assert.ok(CONFIG.MODEL_COSTS_INPUT.flash >= 0.0001, 'Flash input cost should reflect Gemini 3 pricing');
    });

    it('CONFIG should have deepseek and grok pricing', () => {
        const CONFIG = require('../config/constants');
        assert.ok(typeof CONFIG.MODEL_COSTS_OUTPUT.deepseek === 'number');
        assert.ok(typeof CONFIG.MODEL_COSTS_OUTPUT.grok === 'number');
        assert.ok(typeof CONFIG.MODEL_COSTS_INPUT.deepseek === 'number');
        assert.ok(typeof CONFIG.MODEL_COSTS_INPUT.grok === 'number');
    });
});
