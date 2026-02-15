const { describe, it } = require('node:test');
const assert = require('node:assert');
const { validate, getBotNameFromFilename, schemas } = require('../contracts/schemas');

// ============================================================================
// validate()
// ============================================================================
describe('validate', () => {
    it('should pass valid BRIEF_VALIDATOR data', () => {
        const data = {
            status: 'PASS',
            briefing_estruturado: { tema: 'Test' },
            faltando: [],
            confidence: 85
        };
        const result = validate(data, 'BRIEF_VALIDATOR');
        assert.strictEqual(result.valid, true);
        assert.strictEqual(result.errors.length, 0);
    });

    it('should fail when required field is missing', () => {
        const data = { confidence: 90 }; // missing 'status'
        const result = validate(data, 'BRIEF_VALIDATOR');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('status')));
    });

    it('should fail when enum value is invalid', () => {
        const data = { status: 'INVALID_VALUE' };
        const result = validate(data, 'BRIEF_VALIDATOR');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('status')));
    });

    it('should fail when type is wrong', () => {
        const data = {
            status: 'PASS',
            confidence: 'not_a_number' // should be number
        };
        const result = validate(data, 'BRIEF_VALIDATOR');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('confidence')));
    });

    it('should fail for out-of-range numeric values', () => {
        const data = { status: 'PASS', confidence: 150 }; // max is 100
        const result = validate(data, 'BRIEF_VALIDATOR');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('confidence')));
    });

    it('should return error for unknown schema', () => {
        const result = validate({}, 'NONEXISTENT_SCHEMA');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors[0].includes('not found'));
    });

    it('should validate PAIN_CHECK schema', () => {
        const data = {
            pain_check: { is_real: true, demand_level: 'high' },
            status: 'PASS',
            idea_name: 'Test Idea'
        };
        const result = validate(data, 'PAIN_CHECK');
        assert.strictEqual(result.valid, true);
    });

    it('should handle array type with minItems', () => {
        const data = {
            angles: [] // requires minItems: 1
        };
        const result = validate(data, 'ANGEL_GEN');
        assert.strictEqual(result.valid, false);
        assert.ok(result.errors.some(e => e.includes('angles')));
    });

    it('should support multi-type fields', () => {
        // BRAND_GUARDIAN.notas accepts 'array' or 'string'
        const dataArray = { status: 'BRAND_OK', notas: ['nota1'] };
        const resultArray = validate(dataArray, 'BRAND_GUARDIAN');
        assert.strictEqual(resultArray.valid, true);

        const dataString = { status: 'BRAND_OK', notas: 'uma nota' };
        const resultString = validate(dataString, 'BRAND_GUARDIAN');
        assert.strictEqual(resultString.valid, true);
    });
});

// ============================================================================
// getBotNameFromFilename()
// ============================================================================
describe('getBotNameFromFilename', () => {
    it('should extract bot name from standard filename', () => {
        assert.strictEqual(getBotNameFromFilename('JOB123_01_VALIDATOR.json'), 'VALIDATOR');
    });

    it('should extract bot name from ideias filename', () => {
        assert.strictEqual(getBotNameFromFilename('JOB456_PAIN_CHECK.json'), 'PAIN_CHECK');
    });

    it('should return null for unrecognized filenames', () => {
        assert.strictEqual(getBotNameFromFilename('random_file.txt'), null);
    });

    it('should return null for non-schema bot names', () => {
        assert.strictEqual(getBotNameFromFilename('JOB123_01_UNKNOWN_BOT.json'), null);
    });
});

// ============================================================================
// Schema exports
// ============================================================================
describe('schemas export', () => {
    it('should export all marketing schemas', () => {
        assert.ok(schemas.BRIEF_VALIDATOR);
        assert.ok(schemas.AUDIENCE_ANALYST);
        assert.ok(schemas.TOPIC_RESEARCHER);
        assert.ok(schemas.CLAIMS_CHECKER);
        assert.ok(schemas.COPY_SENIOR);
        assert.ok(schemas.FILTRO_FINAL);
    });

    it('should export backwards-compat aliases', () => {
        assert.strictEqual(schemas.VALIDATOR, schemas.BRIEF_VALIDATOR);
        assert.strictEqual(schemas.WALL, schemas.FILTRO_FINAL);
        assert.strictEqual(schemas.CRITICS, schemas.COPY_SENIOR);
    });

    it('should export ideias schemas', () => {
        assert.ok(schemas.PAIN_CHECK);
        assert.ok(schemas.MARKET_SCAN);
        assert.ok(schemas.ANGEL_GEN);
        assert.ok(schemas.DEVIL_GEN);
        assert.ok(schemas.VIABILITY);
    });
});
