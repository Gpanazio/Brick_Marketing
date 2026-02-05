/**
 * BRICK AI - Contracts / Schemas
 * Definições de schema para validação de output dos agentes
 * 
 * Cada schema define:
 * - Campos obrigatórios
 * - Tipos esperados
 * - Valores válidos (enums)
 */

// Schema base com campos comuns
const baseSchema = {
    agent: { type: 'string', required: true },
    job_id: { type: 'string', required: false },
    timestamp: { type: 'string', required: false },
    status: { type: 'string', required: false, enum: ['PASS', 'FAIL', 'ERROR', 'PENDING'] }
};

// ============================================
// MARKETING PIPELINE SCHEMAS
// ============================================

const BRIEF_VALIDATOR = {
    name: 'BRIEF_VALIDATOR',
    required: ['status'],
    properties: {
        status: { type: 'string', enum: ['PASS', 'FAIL'] },
        can_proceed: { type: 'boolean' },
        missing_fields: { type: 'array' },
        briefing_estruturado: { type: 'object' },
        perguntas_para_humano: { type: 'array' },
        confidence: { type: 'number', min: 0, max: 100 }
    }
};

const AUDIENCE_ANALYST = {
    name: 'AUDIENCE_ANALYST',
    required: ['persona'],
    properties: {
        persona: { type: 'object' },
        alignment_score: { type: 'number', min: 0, max: 100 },
        dores: { type: 'array' },
        motivadores: { type: 'array' },
        linguagem_comum: { type: 'array' },
        objecoes: { type: 'array' },
        recomendacoes: { type: 'array' }
    }
};

const TOPIC_RESEARCHER = {
    name: 'TOPIC_RESEARCHER',
    required: ['insights'],
    properties: {
        insights: { type: 'array' },
        keywords_principais: { type: 'array' },
        dados_credibilidade: { type: 'array' },
        tendencias_atuais: { type: 'array' },
        angulos_concorrentes: { type: 'array' },
        oportunidades_diferenciacao: { type: 'array' },
        fontes: { type: 'array' }
    }
};

const CLAIMS_CHECKER = {
    name: 'CLAIMS_CHECKER',
    required: ['claims_validados'],
    properties: {
        claims_validados: { type: 'array' },
        estatisticas_recomendadas: { type: 'array' },
        estatisticas_evitar: { type: 'array' },
        resumo: { type: 'object' },
        risk_level: { type: 'string', enum: ['low', 'medium', 'high'] }
    }
};

const BRAND_GUARDIAN = {
    name: 'BRAND_GUARDIAN',
    required: ['status'],
    properties: {
        status: { type: 'string', enum: ['BRAND_OK', 'BRAND_FAIL'] },
        copies_avaliadas: { type: 'object' },
        problemas: { type: 'array' },
        sugestoes: { type: 'array' },
        scores: { type: 'object' }
    }
};

const COPY_SENIOR = {
    name: 'COPY_SENIOR',
    required: ['vencedor', 'copy_revisada', 'veredito'],
    properties: {
        vencedor: { type: 'string', enum: ['A', 'B', 'C', 'a', 'b', 'c'] },
        modelo_vencedor: { type: 'string' },
        pontos_fortes: { type: 'array' },
        pontos_fracos: { type: 'array' },
        alteracoes_aplicadas: { type: 'array' },
        copy_revisada: { type: 'string' },
        veredito: { type: 'string', enum: ['APPROVED', 'REJECTED'] }
    }
};

const FILTRO_FINAL = {
    name: 'FILTRO_FINAL',
    required: ['score_final', 'status'],
    properties: {
        score_final: { type: 'number', min: 0, max: 100 },
        status: { type: 'string', enum: ['APPROVED', 'REJECTED', 'BLOCKED'] },
        breakdown: { type: 'object' },
        destaques_positivos: { type: 'array' },
        pontos_de_melhoria: { type: 'array' },
        feedback_para_douglas: { type: 'string' }
    }
};

// ============================================
// PROJETOS PIPELINE SCHEMAS
// ============================================

const BRAND_DIGEST = {
    name: 'BRAND_DIGEST',
    required: ['identity_core'],
    properties: {
        identity_core: { type: 'object' },
        positioning: { type: 'object' },
        visual_sensorial: { type: 'object' },
        constraints: { type: 'object' },
        creative_brief_summary: { type: 'string' }
    }
};

const CONCEPT_CRITIC = {
    name: 'CONCEPT_CRITIC',
    required: ['winner'],
    properties: {
        evaluation: { type: 'object' },
        winner: { type: 'string', enum: ['GPT', 'FLASH', 'SONNET', 'gpt', 'flash', 'sonnet', 'A', 'B', 'C'] },
        runner_up: { type: 'string' },
        winner_score: { type: 'number', min: 0, max: 100 },
        feedback: { type: 'object' },
        recommendation: { type: 'string' }
    }
};

const EXECUTION_DESIGN = {
    name: 'EXECUTION_DESIGN',
    required: ['visual_system'],
    properties: {
        concept_name: { type: 'string' },
        visual_system: { type: 'object' },
        copy_framework: { type: 'object' },
        ux_interactions: { type: 'object' },
        technical_specs: { type: 'object' },
        moodboard_references: { type: 'array' },
        production_notes: { type: 'string' },
        status: { type: 'string', enum: ['PASS', 'FAIL'] }
    }
};

// ============================================
// IDEIAS PIPELINE SCHEMAS
// ============================================

const PAIN_CHECK = {
    name: 'PAIN_CHECK',
    required: ['pain_check', 'status'],
    properties: {
        idea_name: { type: 'string' },
        pain_check: { type: 'object' },
        evidence: { type: 'array' },
        red_flags: { type: 'array' },
        status: { type: 'string', enum: ['PASS', 'FAIL'] },
        next_step: { type: 'string', enum: ['MARKET_SCAN', 'REJECT'] }
    }
};

// MARKET_SCAN: output é .md (markdown), não JSON. Schema removido.
// Se migrar para .json no futuro, adicionar schema aqui.

const ANGLE_GEN = {
    name: 'ANGLE_GEN',
    required: ['angles'],
    properties: {
        idea_name: { type: 'string' },
        angles: { type: 'array', minItems: 1 },
        recommended: { type: 'string' },
        reasoning: { type: 'string' },
        status: { type: 'string', enum: ['PASS', 'FAIL'] }
    }
};

const DEVIL_GEN = {
    name: 'DEVIL_GEN',
    required: ['failure_scenarios'],
    properties: {
        idea_name: { type: 'string' },
        failure_scenarios: { type: 'array' },
        hidden_risks: { type: 'array' },
        dealbreakers: { type: 'array' },
        overall_assessment: { type: 'string' },
        risk_score: { type: 'number', min: 0, max: 100 }
    }
};

const VIABILITY = {
    name: 'VIABILITY',
    required: ['decision', 'score'],
    properties: {
        idea_name: { type: 'string' },
        viability_assessment: { type: 'object' },
        score: { type: 'number', min: 0, max: 100 },
        decision: { type: 'string', enum: ['GO', 'CONDITIONAL_GO', 'REVISIT', 'NO_GO'] },
        recommendation: { type: 'string' },
        next_steps: { type: 'array' },
        risks: { type: 'array' },
        mitigations: { type: 'array' }
    }
};

// ============================================
// EXPORTS
// ============================================

const schemas = {
    // Marketing
    BRIEF_VALIDATOR,
    VALIDATOR: BRIEF_VALIDATOR, // Alias
    AUDIENCE_ANALYST,
    AUDIENCE: AUDIENCE_ANALYST, // Alias
    TOPIC_RESEARCHER,
    RESEARCH: TOPIC_RESEARCHER, // Alias
    CLAIMS_CHECKER,
    CLAIMS: CLAIMS_CHECKER, // Alias
    BRAND_GUARDIAN,
    BRAND_GUARDIANS: BRAND_GUARDIAN, // Alias
    COPY_SENIOR,
    CRITICS: COPY_SENIOR, // Alias (backwards compat)
    CRITIC: COPY_SENIOR, // Alias
    FILTRO_FINAL,
    WALL: FILTRO_FINAL, // Alias

    // Projetos
    BRAND_DIGEST,
    CONCEPT_CRITIC,
    EXECUTION_DESIGN,

    // Ideias
    PAIN_CHECK,
    // MARKET_SCAN: output é .md, schema não aplicável
    ANGLE_GEN,
    DEVIL_GEN,
    VIABILITY
};

/**
 * Valida um objeto contra um schema
 * @param {object} data - Dados a validar
 * @param {string} schemaName - Nome do schema
 * @returns {object} { valid: boolean, errors: array }
 */
function validate(data, schemaName) {
    const schema = schemas[schemaName];
    if (!schema) {
        return { valid: false, errors: [`Schema '${schemaName}' not found`] };
    }

    const errors = [];

    // Verifica campos obrigatórios
    if (schema.required) {
        for (const field of schema.required) {
            if (data[field] === undefined || data[field] === null) {
                errors.push(`Missing required field: ${field}`);
            }
        }
    }

    // Verifica tipos e valores
    if (schema.properties) {
        for (const [field, rules] of Object.entries(schema.properties)) {
            if (data[field] !== undefined) {
                // Type check
                if (rules.type) {
                    const actualType = Array.isArray(data[field]) ? 'array' : typeof data[field];
                    if (actualType !== rules.type) {
                        errors.push(`Field '${field}' expected ${rules.type}, got ${actualType}`);
                    }
                }

                // Enum check
                if (rules.enum && !rules.enum.includes(data[field])) {
                    errors.push(`Field '${field}' must be one of: ${rules.enum.join(', ')}`);
                }

                // Range check
                if (rules.min !== undefined && data[field] < rules.min) {
                    errors.push(`Field '${field}' must be >= ${rules.min}`);
                }
                if (rules.max !== undefined && data[field] > rules.max) {
                    errors.push(`Field '${field}' must be <= ${rules.max}`);
                }

                // Array minItems
                if (rules.minItems && Array.isArray(data[field]) && data[field].length < rules.minItems) {
                    errors.push(`Field '${field}' must have at least ${rules.minItems} items`);
                }
            }
        }
    }

    return {
        valid: errors.length === 0,
        errors
    };
}

/**
 * Extrai o nome do bot do nome do arquivo
 * @param {string} filename - Nome do arquivo (ex: JOB123_01_VALIDATOR.json)
 * @returns {string|null} Nome do bot ou null
 */
function getBotNameFromFilename(filename) {
    // Padrões comuns: JOB_01_VALIDATOR.json, JOB_PAIN_CHECK.json
    const patterns = [
        /_(\d+)_([A-Z_]+)\.json$/i,  // JOB_01_VALIDATOR.json
        /_([A-Z_]+)\.json$/i          // JOB_VIABILITY.json
    ];

    for (const pattern of patterns) {
        const match = filename.match(pattern);
        if (match) {
            const botName = match[match.length - 1].toUpperCase();
            if (schemas[botName]) return botName;
        }
    }

    return null;
}

module.exports = {
    schemas,
    validate,
    getBotNameFromFilename,
    // Individual exports for convenience
    ...schemas
};
