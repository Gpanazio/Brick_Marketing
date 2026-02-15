const { describe, it } = require('node:test');
const assert = require('node:assert');
const { CostTracker, calculateCost, getModelPricing, normalizeModelName, MODEL_PRICING, DEFAULT_PRICING } = require('../lib/cost-tracker');

// ============================================================================
// normalizeModelName
// ============================================================================
describe('normalizeModelName', () => {
    it('should strip models/ prefix', () => {
        assert.strictEqual(normalizeModelName('models/gemini-3-flash-preview'), 'gemini-3-flash-preview');
    });

    it('should return empty string for null/undefined', () => {
        assert.strictEqual(normalizeModelName(null), '');
        assert.strictEqual(normalizeModelName(undefined), '');
    });

    it('should leave normal model names unchanged', () => {
        assert.strictEqual(normalizeModelName('gemini-3-flash-preview'), 'gemini-3-flash-preview');
        assert.strictEqual(normalizeModelName('openai/gpt-5.1'), 'openai/gpt-5.1');
    });
});

// ============================================================================
// getModelPricing
// ============================================================================
describe('getModelPricing', () => {
    it('should return correct pricing for Gemini 3 Flash', () => {
        const pricing = getModelPricing('gemini-3-flash-preview');
        assert.strictEqual(pricing.input, 0.50);
        assert.strictEqual(pricing.output, 3.00);
    });

    it('should return correct pricing for Claude Opus', () => {
        const pricing = getModelPricing('anthropic/claude-opus-4.6');
        assert.strictEqual(pricing.input, 15.00);
        assert.strictEqual(pricing.output, 75.00);
    });

    it('should return correct pricing for DeepSeek', () => {
        const pricing = getModelPricing('deepseek/deepseek-v3.2');
        assert.strictEqual(pricing.input, 0.27);
        assert.strictEqual(pricing.output, 1.10);
    });

    it('should return default pricing for unknown models', () => {
        const pricing = getModelPricing('unknown/model-42');
        assert.deepStrictEqual(pricing, DEFAULT_PRICING);
    });

    it('should handle models/ prefix via normalizeModelName', () => {
        const pricing = getModelPricing('models/gemini-3-flash-preview');
        assert.strictEqual(pricing.input, 0.50);
    });
});

// ============================================================================
// calculateCost
// ============================================================================
describe('calculateCost', () => {
    it('should calculate cost correctly for Gemini 3 Flash', () => {
        const usage = { prompt_tokens: 2000, completion_tokens: 800, total_tokens: 2800 };
        const cost = calculateCost('gemini-3-flash-preview', usage);

        // 2000 / 1M * 0.50 = 0.001
        assert.strictEqual(cost.input_cost, 0.001);
        // 800 / 1M * 3.00 = 0.0024
        assert.ok(Math.abs(cost.output_cost - 0.0024) < 1e-10, `Expected ~0.0024, got ${cost.output_cost}`);
        assert.ok(Math.abs(cost.total_cost - 0.0034) < 1e-10, `Expected ~0.0034, got ${cost.total_cost}`);
    });

    it('should calculate cost correctly for Claude Opus', () => {
        const usage = { prompt_tokens: 10000, completion_tokens: 2000, total_tokens: 12000 };
        const cost = calculateCost('anthropic/claude-opus-4.6', usage);

        // 10000 / 1M * 15.00 = 0.15
        assert.strictEqual(cost.input_cost, 0.15);
        // 2000 / 1M * 75.00 = 0.15
        assert.strictEqual(cost.output_cost, 0.15);
        assert.strictEqual(cost.total_cost, 0.30);
    });

    it('should return zero cost for zero tokens', () => {
        const usage = { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };
        const cost = calculateCost('gemini-3-flash-preview', usage);
        assert.strictEqual(cost.total_cost, 0);
    });
});

// ============================================================================
// CostTracker
// ============================================================================
describe('CostTracker', () => {
    it('should initialize with correct metadata', () => {
        const tracker = new CostTracker('JOB123', 'marketing');
        assert.strictEqual(tracker.jobId, 'JOB123');
        assert.strictEqual(tracker.mode, 'marketing');
        assert.strictEqual(tracker.steps.length, 0);
    });

    it('should add steps and accumulate costs', () => {
        const tracker = new CostTracker('JOB456', 'ideias');

        tracker.addStep('PAIN_CHECK', 'gemini-3-flash-preview', {
            prompt_tokens: 2000, completion_tokens: 600, total_tokens: 2600
        }, 1500);

        tracker.addStep('MARKET_SCAN', 'gemini-3-flash-preview', {
            prompt_tokens: 2500, completion_tokens: 800, total_tokens: 3300
        }, 2000);

        assert.strictEqual(tracker.steps.length, 2);
        assert.strictEqual(tracker.steps[0].stage, 'PAIN_CHECK');
        assert.strictEqual(tracker.steps[1].stage, 'MARKET_SCAN');
    });

    it('should generate a complete report', () => {
        const tracker = new CostTracker('JOB789', 'marketing');

        tracker.addStep('VALIDATOR', 'gemini-3-flash-preview', {
            prompt_tokens: 2000, completion_tokens: 500, total_tokens: 2500
        }, 1000);

        tracker.addStep('COPY_A', 'openai/gpt-5.1', {
            prompt_tokens: 5000, completion_tokens: 1500, total_tokens: 6500
        }, 3000);

        const report = tracker.getReport();

        assert.strictEqual(report.job_id, 'JOB789');
        assert.strictEqual(report.mode, 'marketing');
        assert.strictEqual(report.summary.total_steps, 2);
        assert.strictEqual(report.summary.total_tokens, 9000);
        assert.strictEqual(report.summary.input_tokens, 7000);
        assert.strictEqual(report.summary.output_tokens, 2000);
        assert.strictEqual(report.summary.pricing_source, 'openrouter_equivalent');
        assert.ok(report.summary.total_cost_usd > 0);
        assert.ok(report.steps.length === 2);
    });

    it('should handle empty report gracefully', () => {
        const tracker = new CostTracker('EMPTY', 'projetos');
        const report = tracker.getReport();

        assert.strictEqual(report.summary.total_steps, 0);
        assert.strictEqual(report.summary.total_tokens, 0);
        assert.strictEqual(report.summary.total_cost_usd, 0);
    });
});
