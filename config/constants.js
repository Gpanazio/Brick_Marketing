// Configuração centralizada do Brick AI Squad
module.exports = {
    THRESHOLDS: {
        CRITIC_LITE: {
            pass: 65,
            weights: {
                clareza_oferta: 0.25,
                dor_reconhecivel: 0.20,
                prova_credibilidade: 0.20,
                on_brand: 0.20,
                cta_especifico: 0.15
            }
        },
        CRITIC_OPUS: {
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
    // Custo estimado por modelo (USD por 1K tokens output)
    MODEL_COSTS: {
        'flash': 0.0004,       // Gemini Flash - $0.40/1M
        'gemini': 0.007,       // Gemini Pro - $7/1M
        'gpt': 0.015,          // GPT-5.2 - $15/1M
        'sonnet': 0.015,       // Claude Sonnet - $15/1M
        'opus': 0.075          // Claude Opus - $75/1M
    },
    // Tokens médios por etapa (estimativa)
    AVG_TOKENS_PER_STEP: {
        'VALIDATOR': 500,
        'AUDIENCE': 800,
        'RESEARCH': 1200,
        'CLAIMS': 600,
        'COPYWRITER': 1500,
        'BRAND_GUARDIANS': 800,
        'CRITICS': 1000,
        'DIRECTOR': 1200,
        'WALL': 1000,
        // Ideias
        'PAIN_CHECK': 600,
        'MARKET_SCAN': 800,
        'ANGLE_GEN': 1200,
        'VIABILITY': 1000,
        // Projetos
        'BRAND_DIGEST': 800,
        'CREATIVE_IDEATION': 1500,
        'CONCEPT_CRITIC': 800,
        'EXECUTION_DESIGN': 1000
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
