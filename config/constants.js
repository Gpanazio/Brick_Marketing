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
