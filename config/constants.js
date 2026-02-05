// Configuração centralizada do Brick AI Squad
module.exports = {
    THRESHOLDS: {
        COPY_SENIOR: {
            pass: 65,
            weights: {
                clareza_oferta: 0.25,
                dor_reconhecivel: 0.20,
                prova_credibilidade: 0.20,
                on_brand: 0.20,
                cta_especifico: 0.15
            }
        },
        WALL: {
            pass: 80
        },
        COPYWRITER: {
            claudeAttempts: 2,
            fallbackModel: 'gemini-3-pro'
        }
    },
    MODELS: {
        FLASH: 'gemini-2.0-flash-exp',
        CREATIVE: 'claude-sonnet-4',
        REASONING: 'claude-opus-4'
    },
    // Custo estimado por modelo (USD por 1K tokens)
    MODEL_COSTS_OUTPUT: {
        'flash': 0.0004,       // Gemini Flash - $0.40/1M output
        'pro': 0.010,          // Gemini Pro - $10/1M output
        'gpt': 0.010,          // GPT-5.2 Codex - $10/1M output
        'sonnet': 0.015,       // Claude Sonnet 4.5 - $15/1M output
        'opus': 0.075          // Claude Opus 4.5 - $75/1M output
    },
    MODEL_COSTS_INPUT: {
        'flash': 0.000075,     // Gemini Flash - $0.075/1M input
        'pro': 0.00125,        // Gemini Pro - $1.25/1M input
        'gpt': 0.0025,         // GPT-5.2 Codex - $2.50/1M input
        'sonnet': 0.003,       // Claude Sonnet 4.5 - $3/1M input
        'opus': 0.015          // Claude Opus 4.5 - $15/1M input
    },
    // Tokens médios por etapa (estimativa output)
    AVG_TOKENS_PER_STEP: {
        'VALIDATOR': 500,
        'AUDIENCE': 800,
        'RESEARCH': 1200,
        'CLAIMS': 600,
        'COPYWRITER': 1500,
        'COPY_SENIOR': 2000,
        'WALL': 1000,
        // Ideias
        'PAIN_CHECK': 600,
        'MARKET_SCAN': 800,
        'ANGLE_GEN': 1200,
        'DEVIL_GEN': 1200,
        'VIABILITY': 1000,
        // Projetos
        'BRAND_DIGEST': 800,
        'CREATIVE_IDEATION': 1500,
        'CONCEPT_CRITIC': 1000,
        'EXECUTION_DESIGN': 1200,
        'PROPOSAL_WRITER': 1500,
        'PROJECT_DIRECTOR': 1200
    },
    // Tokens médios por etapa (estimativa input - contexto acumulado)
    AVG_INPUT_TOKENS_PER_STEP: {
        'VALIDATOR': 2000,
        'AUDIENCE': 2500,
        'RESEARCH': 3000,
        'CLAIMS': 3500,
        'COPYWRITER': 5000,
        'COPY_SENIOR': 10000,
        'WALL': 12000,
        // Ideias
        'PAIN_CHECK': 2000,
        'MARKET_SCAN': 2500,
        'ANGLE_GEN': 3000,
        'DEVIL_GEN': 3000,
        'VIABILITY': 6000,
        // Projetos
        'BRAND_DIGEST': 2000,
        'CREATIVE_IDEATION': 3500,
        'CONCEPT_CRITIC': 8000,
        'EXECUTION_DESIGN': 6000,
        'PROPOSAL_WRITER': 8000,
        'PROJECT_DIRECTOR': 10000
    },
    PATHS: {
        BRIEFING: 'marketing/briefing',
        WIP: 'marketing/wip',
        DONE: 'marketing/done',
        FAILED: 'marketing/failed'
    },
    RETRY: {
        maxAttempts: 3,
        baseDelayMs: 1000
    }
};
