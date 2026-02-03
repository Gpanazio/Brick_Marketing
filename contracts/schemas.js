// Contratos de validação para outputs dos bots
module.exports = {
    briefValidator: {
        required: ['status', 'missing_fields'],
        validate: (data) => {
            if (!data || typeof data !== 'object') return { valid: false, error: 'Data must be object' };
            if (!['PASS', 'FAIL'].includes(data.status)) return { valid: false, error: 'status must be PASS or FAIL' };
            if (!Array.isArray(data.missing_fields)) return { valid: false, error: 'missing_fields must be array' };
            return { valid: true };
        }
    },
    audienceAnalyst: {
        required: ['perfil', 'dores', 'gatilhos'],
        validate: (data) => {
            if (!data || typeof data !== 'object') return { valid: false, error: 'Data must be object' };
            return { valid: true };
        }
    },
    claimsChecker: {
        required: ['claims_ok', 'claims_risky'],
        validate: (data) => {
            if (!data || typeof data !== 'object') return { valid: false, error: 'Data must be object' };
            if (!Array.isArray(data.claims_ok)) return { valid: false, error: 'claims_ok must be array' };
            if (!Array.isArray(data.claims_risky)) return { valid: false, error: 'claims_risky must be array' };
            return { valid: true };
        }
    },
    copywriter: {
        required: ['variacoes'],
        validate: (data) => {
            if (!data || typeof data !== 'object') return { valid: false, error: 'Data must be object' };
            if (!Array.isArray(data.variacoes) || data.variacoes.length === 0) {
                return { valid: false, error: 'variacoes must be non-empty array' };
            }
            return { valid: true };
        }
    },
    criticLite: {
        required: ['scores', 'recomendacao'],
        validate: (data) => {
            if (!data || typeof data !== 'object') return { valid: false, error: 'Data must be object' };
            return { valid: true };
        }
    },
    criticOpus: {
        required: ['decisao', 'score'],
        validate: (data) => {
            if (!data || typeof data !== 'object') return { valid: false, error: 'Data must be object' };
            if (!['PUBLICAR', 'REVISAR', 'REJEITAR'].includes(data.decisao)) {
                return { valid: false, error: 'decisao must be PUBLICAR, REVISAR, or REJEITAR' };
            }
            return { valid: true };
        }
    }
};
