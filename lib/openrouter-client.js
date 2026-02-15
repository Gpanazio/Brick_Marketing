// OpenRouter Client - Autonomous Pipeline Runner
// Usa a API da OpenRouter diretamente

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

// Modelos gratuitos para teste (ordenados por qualidade)
const FREE_MODELS = [
    'openai/gpt-5.1',
    'anthropic/claude-sonnet-4.5',
    'google/gemini-3-flash-preview',
    'openrouter/minimax/minimax-m2.5',
];

// Modelos pagos (para quando funcionar)
const PAID_MODELS = {
    flash: 'google/gemini-3-flash-preview-exp',
    gpt: 'openai/gpt-5.3-codex',
    sonnet: 'anthropic/claude-sonnet-4-20250514',
    gpt53: 'openai/gpt-5.3-codex',
};

class OpenRouterClient {
    constructor(apiKey = OPENROUTER_API_KEY) {
        this.apiKey = apiKey;
        this.baseUrl = OPENROUTER_BASE_URL;
    }

    async chat(messages, model = 'google/gemini-3-flash-preview', options = {}) {
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
        const content = data.choices[0].message.content;
        const usage = data.usage ? {
            prompt_tokens: data.usage.prompt_tokens || 0,
            completion_tokens: data.usage.completion_tokens || 0,
            total_tokens: data.usage.total_tokens || 0
        } : { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 };

        return { content, usage };
    }

    // Wrapper para pipeline - interface única para chamadas de modelo
    async callAgent(role, prompt, model = 'google/gemini-3-flash-preview') {
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
