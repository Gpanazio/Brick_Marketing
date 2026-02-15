const { describe, it, beforeEach } = require('node:test');
const assert = require('node:assert');

// We need to extract utility functions from pipeline-runner.js
// Since they're module-level (not exported), we'll test them via a helper module
// For now, test the exported interface

// ============================================================================
// tryParseJSON (extracted inline for testing)
// ============================================================================
function tryParseJSON(str) {
    if (!str || typeof str !== 'string') return null;
    // Strip markdown code blocks
    let clean = str.replace(/```json\s*/gi, '').replace(/```\s*/g, '').trim();
    try {
        return JSON.parse(clean);
    } catch {
        // Try to find JSON object in the string
        const match = clean.match(/\{[\s\S]*\}/);
        if (match) {
            try { return JSON.parse(match[0]); } catch { return null; }
        }
        return null;
    }
}

function truncate(str, max = 500) {
    if (!str) return '';
    if (typeof str !== 'string') str = JSON.stringify(str);
    return str.length > max ? str.substring(0, max) + '...' : str;
}

function createPlaceholder(botName, jobId, errorMsg) {
    return JSON.stringify({
        status: 'PLACEHOLDER',
        bot: botName,
        job_id: jobId,
        error: errorMsg || 'Agent failed',
        generated_at: new Date().toISOString()
    }, null, 2);
}

// ============================================================================
// tryParseJSON
// ============================================================================
describe('tryParseJSON', () => {
    it('should parse valid JSON', () => {
        const result = tryParseJSON('{"key": "value"}');
        assert.deepStrictEqual(result, { key: 'value' });
    });

    it('should parse JSON wrapped in markdown code blocks', () => {
        const result = tryParseJSON('```json\n{"key": "value"}\n```');
        assert.deepStrictEqual(result, { key: 'value' });
    });

    it('should extract JSON object from surrounding text', () => {
        const result = tryParseJSON('Here is the result:\n{"status": "PASS"}\nDone.');
        assert.deepStrictEqual(result, { status: 'PASS' });
    });

    it('should return null for invalid JSON', () => {
        assert.strictEqual(tryParseJSON('this is not json'), null);
    });

    it('should return null for null/undefined', () => {
        assert.strictEqual(tryParseJSON(null), null);
        assert.strictEqual(tryParseJSON(undefined), null);
    });

    it('should return null for empty string', () => {
        assert.strictEqual(tryParseJSON(''), null);
    });

    it('should return null for non-string input', () => {
        assert.strictEqual(tryParseJSON(42), null);
        assert.strictEqual(tryParseJSON({}), null);
    });

    it('should handle nested JSON', () => {
        const input = '{"outer": {"inner": [1, 2, 3]}}';
        const result = tryParseJSON(input);
        assert.deepStrictEqual(result, { outer: { inner: [1, 2, 3] } });
    });
});

// ============================================================================
// truncate
// ============================================================================
describe('truncate', () => {
    it('should not truncate short strings', () => {
        assert.strictEqual(truncate('hello', 500), 'hello');
    });

    it('should truncate long strings and add ellipsis', () => {
        const long = 'a'.repeat(600);
        const result = truncate(long, 500);
        assert.strictEqual(result.length, 503); // 500 + '...'
        assert.ok(result.endsWith('...'));
    });

    it('should handle null/undefined', () => {
        assert.strictEqual(truncate(null), '');
        assert.strictEqual(truncate(undefined), '');
    });

    it('should stringify objects', () => {
        const result = truncate({ key: 'value' }, 500);
        assert.ok(result.includes('key'));
        assert.ok(result.includes('value'));
    });

    it('should use default max of 500', () => {
        const long = 'b'.repeat(600);
        const result = truncate(long);
        assert.strictEqual(result.length, 503);
    });
});

// ============================================================================
// createPlaceholder
// ============================================================================
describe('createPlaceholder', () => {
    it('should create valid JSON placeholder', () => {
        const result = createPlaceholder('VALIDATOR', 'JOB123', 'Test error');
        const parsed = JSON.parse(result);
        assert.strictEqual(parsed.status, 'PLACEHOLDER');
        assert.strictEqual(parsed.bot, 'VALIDATOR');
        assert.strictEqual(parsed.job_id, 'JOB123');
        assert.strictEqual(parsed.error, 'Test error');
        assert.ok(parsed.generated_at);
    });

    it('should use default error message', () => {
        const result = createPlaceholder('AUDIENCE', 'JOB456');
        const parsed = JSON.parse(result);
        assert.strictEqual(parsed.error, 'Agent failed');
    });
});
