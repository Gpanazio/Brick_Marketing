// OpenRouter Client - Autonomous Pipeline Runner
// Usa a API da OpenRouter diretamente (sem OpenClaw)

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Modelos gratuitos para teste (ordenados por qualidade)
const FREE_MODELS = [
    'openrouter/free',           // Router inteligente - auto-seleciona
    'qwen/qwen3-coder:free',     // Qwen Coder - ótimo para código
    'deepseek/deepseek-r1:free', // R1 - reasoning forte
    'google/gemma-3n-e4b-it:free', // Gemma 3
    'nvidia/nemotron-3-nano-30b-a3b:free', // Nemotron
];

// Modelos pagos (para quando funcionar)
const PAID_MODELS = {
    flash: 'google/gemini-2.0-flash-exp',
    gpt: 'openai/gpt-5.3-codex',
    sonnet: 'anthropic/claude-sonnet-4-20250514',
    gpt53: 'openai/gpt-5.3-codex',
};

class OpenRouterClient {
    constructor(apiKey = OPENROUTER_API_KEY) {
        this.apiKey = apiKey;
        this.baseUrl = OPENROUTER_BASE_URL;
    }

    async chat(messages, model = 'openrouter/free', options = {}) {
        if (!this.apiKey) {
            throw new Error('OPENROUTER_API_KEY não configurada');
        }

        const response = await fetch(`${this.baseUrl}/chat/completions`, {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${this.apiKey}`,
                'Content-Type': 'application/json',
                'HTTP-Referer': process.env.RAILWAY_PUBLIC_DOMAIN || 'https://war.brick.mov',
                'X-Title': 'Brick War Room'
            },
            body: JSON.stringify({
                model,
                messages,
                ...options
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`OpenRouter API error: ${response.status} - ${error}`);
        }

        const data = await response.json();
        return data.choices[0].message.content;
    }

    // Wrapper para pipeline - mantém interface similar ao openclaw agent
    async callAgent(role, prompt, model = 'openrouter/free') {
        const messages = [
            { role: 'system', content: role },
            { role: 'user', content: prompt }
        ];

        return await this.chat(messages, model, {
            temperature: 0.7,
            max_tokens: 4000
        });
    }
}

// Factory para obter cliente com base no modo
function getClient(mode = 'free') {
    if (mode === 'free') {
        return new OpenRouterClient();
    }
    // Modo pago usa as chaves do usuário (precisa configurar)
    return new OpenRouterClient(process.env.OPENAI_API_KEY || process.env.GEMINI_API_KEY);
}

// Listar modelos gratuitos disponíveis
async function listFreeModels() {
    const response = await fetch(`${OPENROUTER_BASE_URL}/models?free=true`, {
        headers: {
            'Authorization': `Bearer ${OPENROUTER_API_KEY}`
        }
    });
    const data = await response.json();
    return data.data.slice(0, 20).map(m => ({
        id: m.id,
        name: m.name,
        context: m.context_length
    }));
}

module.exports = {
    OpenRouterClient,
    getClient,
    listFreeModels,
    FREE_MODELS,
    PAID_MODELS
};
