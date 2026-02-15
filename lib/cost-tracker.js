// Cost Tracker - Real token/cost tracking per pipeline run
// Uses OpenRouter-equivalent pricing for ALL models (including Google AI direct calls)

const fs = require('fs');
const path = require('path');

// ============================================================================
// OPENROUTER-EQUIVALENT PRICING (USD per 1M tokens)
// Source: openrouter.ai/models - Updated 2026-02-14
// NOTE: All Gemini Flash references use 'gemini-3-flash-preview' identifier.
// ============================================================================
const MODEL_PRICING = {
    // Google Gemini (Gemini 3 Flash via OpenRouter: $0.50/$3.00 per 1M)
    'gemini-3-flash-preview': { input: 0.50, output: 3.00 },
    'gemini-3-flash-preview-exp': { input: 0.50, output: 3.00 },
    'gemini-3-pro-preview': { input: 1.25, output: 10.00 },

    // OpenAI (via OpenRouter)
    'openai/gpt-5.1': { input: 2.50, output: 10.00 },
    'openai/gpt-5.2': { input: 2.50, output: 10.00 },
    'openai/gpt-5.2-codex': { input: 2.50, output: 10.00 },
    'openai/gpt-5.3-codex': { input: 3.00, output: 12.00 },

    // Anthropic (via OpenRouter)
    'anthropic/claude-sonnet-4.5': { input: 3.00, output: 15.00 },
    'anthropic/claude-sonnet-4-20250514': { input: 3.00, output: 15.00 },
    'anthropic/claude-opus-4.6': { input: 15.00, output: 75.00 },

    // DeepSeek (via OpenRouter)
    'deepseek/deepseek-v3.2': { input: 0.27, output: 1.10 },
    'deepseek/deepseek-r1-0528': { input: 0.55, output: 2.19 },
    'deepseek/deepseek-r1-distill-llama-70b': { input: 0.35, output: 1.40 },

    // xAI (via OpenRouter)
    'x-ai/grok-4.1-fast': { input: 2.00, output: 10.00 },

    // MiniMax (via OpenRouter)
    'minimax/minimax-m2.5': { input: 0.50, output: 1.10 },
    'openrouter/minimax/minimax-m2.5': { input: 0.50, output: 1.10 },

    // Legacy / aliases
    'google/gemini-3-flash-preview': { input: 0.50, output: 3.00 },
};

// Default pricing for unknown models (conservative estimate)
const DEFAULT_PRICING = { input: 1.00, output: 5.00 };

/**
 * Normalize model names for pricing lookup.
 * Handles provider prefixes and common aliases.
 */
function normalizeModelName(model) {
    if (!model) return '';
    // Remove common prefixes for Google models
    let normalized = model.replace(/^models\//, '');
    return normalized;
}

/**
 * Get pricing for a model (USD per 1M tokens)
 */
function getModelPricing(model) {
    const normalized = normalizeModelName(model);
    return MODEL_PRICING[normalized] || MODEL_PRICING[model] || DEFAULT_PRICING;
}

/**
 * Calculate cost for a single API call
 */
function calculateCost(model, usage) {
    const pricing = getModelPricing(model);
    const inputCost = (usage.prompt_tokens / 1_000_000) * pricing.input;
    const outputCost = (usage.completion_tokens / 1_000_000) * pricing.output;
    return {
        input_cost: inputCost,
        output_cost: outputCost,
        total_cost: inputCost + outputCost
    };
}

// ============================================================================
// COST TRACKER CLASS
// ============================================================================

class CostTracker {
    constructor(jobId, mode) {
        this.jobId = jobId;
        this.mode = mode;
        this.steps = [];
        this.startedAt = new Date().toISOString();
    }

    /**
     * Record a pipeline step with its token usage
     */
    addStep(stage, model, usage, durationMs = 0) {
        const cost = calculateCost(model, usage);
        this.steps.push({
            stage,
            model,
            tokens: {
                input: usage.prompt_tokens,
                output: usage.completion_tokens,
                total: usage.total_tokens
            },
            cost: {
                input: Number(cost.input_cost.toFixed(6)),
                output: Number(cost.output_cost.toFixed(6)),
                total: Number(cost.total_cost.toFixed(6))
            },
            duration_ms: durationMs,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Get aggregated cost report
     */
    getReport() {
        const totals = this.steps.reduce((acc, step) => {
            acc.input_tokens += step.tokens.input;
            acc.output_tokens += step.tokens.output;
            acc.total_tokens += step.tokens.total;
            acc.input_cost += step.cost.input;
            acc.output_cost += step.cost.output;
            acc.total_cost += step.cost.total;
            acc.total_duration_ms += step.duration_ms;
            return acc;
        }, {
            input_tokens: 0, output_tokens: 0, total_tokens: 0,
            input_cost: 0, output_cost: 0, total_cost: 0,
            total_duration_ms: 0
        });

        return {
            job_id: this.jobId,
            mode: this.mode,
            started_at: this.startedAt,
            completed_at: new Date().toISOString(),
            summary: {
                total_steps: this.steps.length,
                total_tokens: totals.total_tokens,
                input_tokens: totals.input_tokens,
                output_tokens: totals.output_tokens,
                total_cost_usd: Number(totals.total_cost.toFixed(4)),
                input_cost_usd: Number(totals.input_cost.toFixed(4)),
                output_cost_usd: Number(totals.output_cost.toFixed(4)),
                total_duration_ms: totals.total_duration_ms,
                pricing_source: 'openrouter_equivalent'
            },
            steps: this.steps
        };
    }

    /**
     * Save cost report to WIP directory
     */
    save(wipDir) {
        const report = this.getReport();
        const filePath = path.join(wipDir, `${this.jobId}_COSTS.json`);
        fs.writeFileSync(filePath, JSON.stringify(report, null, 2));
        return filePath;
    }
}

module.exports = {
    CostTracker,
    calculateCost,
    getModelPricing,
    normalizeModelName,
    MODEL_PRICING,
    DEFAULT_PRICING
};
