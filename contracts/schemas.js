/**
 * BRICK AI - Contracts / Schemas
 * Definições de schema para validação de output dos agentes
 * 
 * REGRA: Schemas devem refletir o que os agentes REALMENTE produzem,
 * não o que gostaríamos que produzissem. Atualizado 2026-02-05.
 */

// ============================================
// MARKETING PIPELINE SCHEMAS
// ============================================

const BRIEF_VALIDATOR = {
    name: 'BRIEF_VALIDATOR',
    required: ['status'],
    properties: {
        status: { type: 'string', enum: ['PASS', 'FAIL'] },
        briefing_estruturado: { type: 'object' },
        faltando: { type: 'array' },
        perguntas_para_humano: { type: 'array' },
        proximo_passo: { type: 'string' },
        confidence: { type: 'number', min: 0, max: 100 }
    }
};

const AUDIENCE_ANALYST = {
    name: 'AUDIENCE_ANALYST',
    required: ['persona'],
    properties: {
        persona: { type: 'object' },
        analise_alinhamento: { type: ['object', 'string'] },
        dores: { type: 'array' },
        motivadores_de_acao: { type: 'array' },
        linguagem_comum: { type: 'array' },
        objecoes: { type: 'array' },
        onde_consomem_conteudo: { type: 'array' },
        fontes_consultadas: { type: 'array' }
    }
};

const TOPIC_RESEARCHER = {
    name: 'TOPIC_RESEARCHER',
    required: ['keywords_principais'],
    properties: {
        tema: { type: 'string' },
        keywords_principais: { type: 'array' },
        dados_credibilidade: { type: 'array' },
        tendencias_atuais: { type: 'array' },
        angulos_concorrentes: { type: 'array' },
        oportunidades_diferenciacao: { type: 'array' },
        fontes_consultadas: { type: 'array' },
        brand_guidelines_relevantes: { type: 'object' }
    }
};

const CLAIMS_CHECKER = {
    name: 'CLAIMS_CHECKER',
    required: ['claims_validados'],
    properties: {
        claims_validados: { type: 'array' },
        estatisticas_recomendadas: { type: 'array' },
        estatisticas_evitar: { type: 'array' },
        resumo: { type: 'object' }
    }
};

const BRAND_GUARDIAN = {
    name: 'BRAND_GUARDIAN',
    required: ['status'],
    properties: {
        status: { type: 'string', enum: ['BRAND_OK', 'BRAND_FAIL'] },
        analise_por_versao: { type: 'object' },
        analise_detalhada: { type: 'object' },
        problemas: { type: 'array' },
        notas: { type: ['array', 'string'] },
        sugestoes: { type: 'array' },
        proximo_passo: { type: 'string' }
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
        verdict: { type: 'string' },
        breakdown: { type: 'object' },
        destaques_positivos: { type: 'array' },
        pontos_de_melhoria: { type: 'array' },
        rejection_reasons: { type: 'array' },
        feedback_for_douglas: { type: ['string', 'object'] },
        instrucoes_para_copywriter: { type: ['string', 'object'] },
        notas_para_gabriel: { type: ['string', 'object'] },
        next_step: { type: 'string' },
        recommend_return_to: { type: ['string', 'object'] }
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
    required: ['evaluation', 'winner'],
    properties: {
        evaluation: { type: 'object' },
        winner: { type: 'object' },
        runner_up: { type: 'object' },
        status: { type: 'string', enum: ['PASS', 'FAIL'] },
        timestamp: { type: 'string' }
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
        next_step: { type: 'string' },
        timestamp: { type: 'string' }
    }
};

// MARKET_SCAN: output pode ser .md OU .json dependendo do run.
// Schema cobre o caso JSON.
const MARKET_SCAN = {
    name: 'MARKET_SCAN',
    required: ['market_scan'],
    properties: {
        idea_name: { type: 'string' },
        market_scan: { type: 'object' },
        opportunity_analysis: { type: 'object' },
        opportunity_score: { type: 'number', min: 0, max: 100 },
        differentiation_angles: { type: 'array' },
        status: { type: 'string', enum: ['PASS', 'FAIL'] },
        next_step: { type: 'string' },
        timestamp: { type: 'string' }
    }
};

const ANGLE_GEN = {
    name: 'ANGLE_GEN',
    required: ['angles'],
    properties: {
        idea_name: { type: 'string' },
        angles: { type: 'array', minItems: 1 },
        recommended: { type: 'string' },
        reasoning: { type: 'string' },
        status: { type: 'string', enum: ['PASS', 'FAIL'] },
        next_step: { type: 'string' },
        timestamp: { type: 'string' }
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
        risk_score: { type: 'number', min: 0, max: 100 },
        status: { type: 'string' },
        timestamp: { type: 'string' }
    }
};

const VIABILITY = {
    name: 'VIABILITY',
    required: ['viability_assessment'],
    properties: {
        idea_name: { type: 'string' },
        viability_assessment: { type: 'object' },
        meta_analysis: { type: 'object' },
        recommendation: { type: 'string' },
        decision: { type: 'string', enum: ['GO', 'CONDITIONAL_GO', 'REVISIT', 'NO_GO'] },
        score: { type: 'number', min: 0, max: 100 },
        next_steps: { type: 'array' },
        risks: { type: 'array' },
        mitigations: { type: 'array' },
        timestamp: { type: 'string' }
    }
};

// ============================================
// EXPORTS
// ============================================

const schemas = {
    // Marketing
    BRIEF_VALIDATOR,
    VALIDATOR: BRIEF_VALIDATOR,
    AUDIENCE_ANALYST,
    AUDIENCE: AUDIENCE_ANALYST,
    TOPIC_RESEARCHER,
    RESEARCH: TOPIC_RESEARCHER,
    CLAIMS_CHECKER,
    CLAIMS: CLAIMS_CHECKER,
    BRAND_GUARDIAN,
    BRAND_GUARDIANS: BRAND_GUARDIAN,
    COPY_SENIOR,
    CRITICS: COPY_SENIOR,  // backwards compat
    CRITIC: COPY_SENIOR,   // backwards compat
    FILTRO_FINAL,
    WALL: FILTRO_FINAL,

    // Projetos
    BRAND_DIGEST,
    CONCEPT_CRITIC,
    EXECUTION_DESIGN,

    // Ideias
    PAIN_CHECK,
    MARKET_SCAN,
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
                // Type check (supports single type or array of types)
                if (rules.type) {
                    const actualType = Array.isArray(data[field]) ? 'array' : typeof data[field];
                    const allowedTypes = Array.isArray(rules.type) ? rules.type : [rules.type];
                    if (!allowedTypes.includes(actualType)) {
                        errors.push(`Field '${field}' expected ${allowedTypes.join('|')}, got ${actualType}`);
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
    const patterns = [
        /_(\d+)_([A-Z_]+)\.json$/i,
        /_([A-Z_]+)\.json$/i
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
    ...schemas
};
