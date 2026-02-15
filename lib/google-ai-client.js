// Google AI (Gemini) Client - Direct API access
// Usa a API do Google AI Studio diretamente (sem OpenRouter)

const GOOGLE_AI_API_KEY = process.env.GOOGLE_API_KEY || process.env.GOOGLE_AI_API_KEY;
const GOOGLE_AI_BASE_URL = 'https://generativelanguage.googleapis.com/v1beta';

class GoogleAIClient {
    constructor(apiKey = GOOGLE_AI_API_KEY) {
        this.apiKey = apiKey;
    }

    async callAgent(systemPrompt, userPrompt, model = 'gemini-3-flash-preview') {
        if (!this.apiKey) {
            throw new Error('GOOGLE_AI_API_KEY não configurada');
        }

        // Normalizar nome do modelo (remover prefixo google/ se vier)
        const modelName = model.replace(/^google\//, '').replace(/^models\//, '');

        const url = `${GOOGLE_AI_BASE_URL}/models/${modelName}:generateContent?key=${this.apiKey}`;

        const response = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                system_instruction: { parts: [{ text: systemPrompt }] },
                contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
                generationConfig: {
                    temperature: 0.7,
                    maxOutputTokens: 4000
                }
            })
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Google AI error: ${response.status} - ${error}`);
        }

        const data = await response.json();

        if (!data.candidates || !data.candidates[0]?.content?.parts?.[0]?.text) {
            throw new Error(`Google AI: resposta vazia ou bloqueada - ${JSON.stringify(data.promptFeedback || {})}`);
        }

        const content = data.candidates[0].content.parts[0].text;
        const meta = data.usageMetadata || {};
        const usage = {
            prompt_tokens: meta.promptTokenCount || 0,
            completion_tokens: meta.candidatesTokenCount || 0,
            total_tokens: (meta.promptTokenCount || 0) + (meta.candidatesTokenCount || 0)
        };

        return { content, usage };
    }
}

module.exports = { GoogleAIClient };
