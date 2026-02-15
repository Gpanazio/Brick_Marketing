// Pipeline Runner Autônomo - Brick AI War Room
// Replica o comportamento de run-marketing.sh, run-ideias.sh etc.
// Executa via clients de modelo direto

const fs = require('fs');
const path = require('path');
const { OpenRouterClient } = require('./openrouter-client');
const { GoogleAIClient } = require('./google-ai-client');
const { CostTracker } = require('./cost-tracker');

// ============================================================================
// MODEL ROUTING PER STAGE (ideias pipeline)
// Format: { provider: 'openrouter'|'google', model: 'model-id' }
// ============================================================================
// ============================================================================
// MODEL ROUTING PER STAGE (marketing pipeline)
// ============================================================================
const MARKETING_MODELS = {
    VALIDATOR: { primary: { provider: 'google', model: 'gemini-3-flash-preview' }, fallback: { provider: 'openrouter', model: 'deepseek/deepseek-v3.2' } },
    AUDIENCE: { primary: { provider: 'google', model: 'gemini-3-flash-preview' }, fallback: { provider: 'openrouter', model: 'deepseek/deepseek-v3.2' } },
    RESEARCH: { primary: { provider: 'google', model: 'gemini-3-flash-preview' }, fallback: { provider: 'openrouter', model: 'deepseek/deepseek-v3.2' } },
    CLAIMS: { primary: { provider: 'google', model: 'gemini-3-flash-preview' }, fallback: { provider: 'openrouter', model: 'deepseek/deepseek-v3.2' } },
    COPY_A: { primary: { provider: 'openrouter', model: 'openai/gpt-5.1' }, fallback: { provider: 'google', model: 'gemini-3-flash-preview' } },
    COPY_B: { primary: { provider: 'openrouter', model: 'deepseek/deepseek-v3.2' }, fallback: { provider: 'google', model: 'gemini-3-flash-preview' } },
    COPY_C: { primary: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' }, fallback: { provider: 'google', model: 'gemini-3-flash-preview' } },
    COPY_SENIOR: { primary: { provider: 'openrouter', model: 'openai/gpt-5.1' }, fallback: { provider: 'openrouter', model: 'deepseek/deepseek-v3.2' } },
    WALL: { primary: { provider: 'openrouter', model: 'anthropic/claude-opus-4.6' }, fallback: { provider: 'openrouter', model: 'openai/gpt-5.1' } }
};

// ============================================================================
// MODEL ROUTING PER STAGE (projetos pipeline)
// ============================================================================
const PROJETOS_MODELS = {
    BRAND_DIGEST: { primary: { provider: 'google', model: 'gemini-3-flash-preview' }, fallback: { provider: 'openrouter', model: 'deepseek/deepseek-v3.2' } },
    CREATIVE_A: { primary: { provider: 'openrouter', model: 'openai/gpt-5.1' }, fallback: { provider: 'google', model: 'gemini-3-flash-preview' } },
    CREATIVE_B: { primary: { provider: 'google', model: 'gemini-3-flash-preview' }, fallback: { provider: 'openrouter', model: 'deepseek/deepseek-v3.2' } },
    CREATIVE_C: { primary: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' }, fallback: { provider: 'google', model: 'gemini-3-flash-preview' } },
    CONCEPT_CRITIC: { primary: { provider: 'google', model: 'gemini-3-pro-preview' }, fallback: { provider: 'google', model: 'gemini-3-flash-preview' } },
    EXECUTION_DESIGN: { primary: { provider: 'openrouter', model: 'anthropic/claude-opus-4.6' }, fallback: { provider: 'openrouter', model: 'minimax/minimax-m2.5' } },
    PROPOSAL: { primary: { provider: 'openrouter', model: 'openai/gpt-5.1' }, fallback: { provider: 'openrouter', model: 'deepseek/deepseek-v3.2' } },
    DIRECTOR: { primary: { provider: 'google', model: 'gemini-3-pro-preview' }, fallback: { provider: 'google', model: 'gemini-3-flash-preview' } }
};

// ============================================================================
// MODEL ROUTING PER STAGE (originais pipeline)
// ============================================================================
const ORIGINAIS_MODELS = {
    TRIAGE: { primary: { provider: 'google', model: 'gemini-3-flash-preview' }, fallback: { provider: 'openrouter', model: 'deepseek/deepseek-v3.2' } },
    CREATIVE_DOCTOR: { primary: { provider: 'openrouter', model: 'anthropic/claude-opus-4.6' }, fallback: { provider: 'openrouter', model: 'openai/gpt-5.1' } },
    SALES_SHARK: { primary: { provider: 'openrouter', model: 'x-ai/grok-4.1-fast' }, fallback: { provider: 'google', model: 'gemini-3-flash-preview' } },
    ANGEL: { primary: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' }, fallback: { provider: 'google', model: 'gemini-3-flash-preview' } },
    DEMON: { primary: { provider: 'openrouter', model: 'deepseek/deepseek-r1-0528' }, fallback: { provider: 'openrouter', model: 'deepseek/deepseek-r1-distill-llama-70b' } },
    DOCTOR_FINAL: { primary: { provider: 'openrouter', model: 'openai/gpt-5.2' }, fallback: { provider: 'openrouter', model: 'openai/gpt-5.1' } }
};

const IDEIAS_MODELS = {
    PAIN_CHECK: {
        primary: { provider: 'google', model: 'gemini-3-flash-preview' },
        fallback: { provider: 'openrouter', model: 'minimax/minimax-m2.5' }
    },
    MARKET_SCAN: {
        primary: { provider: 'google', model: 'gemini-3-flash-preview' },
        fallback: { provider: 'openrouter', model: 'deepseek/deepseek-v3.2' }
    },
    ANGEL_GEN: {
        primary: { provider: 'openrouter', model: 'anthropic/claude-sonnet-4.5' },
        fallback: { provider: 'google', model: 'gemini-3-flash-preview' }
    },
    DEVIL_GEN: {
        primary: { provider: 'openrouter', model: 'x-ai/grok-4.1-fast' },
        fallback: { provider: 'google', model: 'gemini-3-flash-preview' }
    },
    VIABILITY: {
        primary: { provider: 'openrouter', model: 'anthropic/claude-opus-4.6' },
        fallback: { provider: 'openrouter', model: 'openai/gpt-5.2-codex' }
    }
};

// ============================================================================
// UTILIDADES
// ============================================================================

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function truncate(text, maxLen) {
    if (!text || text.length <= maxLen) return text || '';
    return text.substring(0, maxLen) + '...';
}

function tryParseJSON(text) {
    try {
        // Limpar markdown wrapping se houver
        let clean = text.trim();
        if (clean.startsWith('```json')) clean = clean.replace(/^```json\n?/, '').replace(/```$/, '');
        if (clean.startsWith('```')) clean = clean.replace(/^```\n?/, '').replace(/```$/, '');
        return JSON.parse(clean);
    } catch (e) {
        return null;
    }
}

function createPlaceholder(stepName, jobId, error) {
    return JSON.stringify({
        job_id: jobId,
        step_name: stepName,
        status: 'FAILED',
        error: error || 'Agent failed or empty output',
        timestamp: new Date().toISOString()
    }, null, 2);
}

// ============================================================================
// PIPELINE RUNNER
// ============================================================================

class PipelineRunner {
    constructor(options = {}) {
        this.openrouterClient = new OpenRouterClient();
        this.googleClient = new GoogleAIClient();
        this.mode = options.mode || 'marketing';
        this.jobId = options.jobId;
        this.io = options.io || null;
        this.rolesDir = options.rolesDir || path.join(__dirname, '..', 'roles');
        this.historyRoot = options.historyRoot || path.join(__dirname, '..', 'history');
        this.wipDir = path.join(this.historyRoot, this.mode, 'wip');
        this.logsDir = path.join(this.wipDir, 'logs');
        this.model = options.model || 'google/gemini-3-flash-preview';
        this.emitStateUpdate = options.emitStateUpdate || (() => { });
        this.maxRetries = 3;
        this.costTracker = new CostTracker(this.jobId, this.mode);

        // Garantir diretórios
        if (!fs.existsSync(this.wipDir)) fs.mkdirSync(this.wipDir, { recursive: true });
        if (!fs.existsSync(this.logsDir)) fs.mkdirSync(this.logsDir, { recursive: true });
    }

    // Carregar role file
    loadRole(filename) {
        const rolePath = path.join(this.rolesDir, filename);
        if (fs.existsSync(rolePath)) {
            return fs.readFileSync(rolePath, 'utf-8');
        }
        console.warn(`[RUNNER] Role não encontrado: ${rolePath}`);
        return '';
    }

    // Emitir progresso para frontend
    emitProgress(stage, status, data = {}) {
        const payload = {
            jobId: this.jobId,
            mode: this.mode,
            stage,
            status,
            timestamp: new Date().toISOString(),
            ...data
        };
        console.log(`[PIPELINE:${this.mode}] ${stage}: ${status}${data.error ? ' - ' + data.error : ''}`);
        if (this.io) {
            this.io.emit('pipeline:progress', payload);
        }
    }

    // Salvar arquivo de resultado
    saveFile(filename, content) {
        const filePath = path.join(this.wipDir, filename);
        fs.writeFileSync(filePath, content);
        this.emitStateUpdate(this.mode);
        return filePath;
    }

    // Salvar log
    saveLog(logName, content) {
        const logPath = path.join(this.logsDir, logName);
        fs.writeFileSync(logPath, `[${new Date().toISOString()}]\n${content}`);
    }

    // Resolve qual client usar baseado em provider
    _getClient(provider) {
        if (provider === 'google') return this.googleClient;
        return this.openrouterClient;
    }

    // Chamar agente com retry + fallback por stage
    // options.stage: nome da etapa (ex: 'PAIN_CHECK') para lookup de modelo específico
    async callWithRetry(systemPrompt, userPrompt, options = {}) {
        const { maxRetries = this.maxRetries, expectJSON = false, stage = null } = options;

        // Resolve modelo: stage-specific > global
        const MODEL_MAP = { ideias: IDEIAS_MODELS, marketing: MARKETING_MODELS, projetos: PROJETOS_MODELS, originais: ORIGINAIS_MODELS };
        const stageModels = (stage && MODEL_MAP[this.mode]?.[stage]) || null;
        const primaryProvider = stageModels?.primary?.provider || 'openrouter';
        const primaryModel = stageModels?.primary?.model || this.model;
        const fallback = stageModels?.fallback || null;

        let lastError;
        const callStart = Date.now();

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            // Usa fallback na última tentativa se disponível
            const useFallback = (attempt === maxRetries && fallback);
            const provider = useFallback ? fallback.provider : primaryProvider;
            const model = useFallback ? fallback.model : primaryModel;
            const client = this._getClient(provider);

            try {
                console.log(`  >> Tentativa ${attempt}/${maxRetries} [${provider}/${model}]${useFallback ? ' (FALLBACK)' : ''}`);
                const { content, usage } = await client.callAgent(systemPrompt, userPrompt, model);

                // Track cost for this step
                const durationMs = Date.now() - callStart;
                if (stage && usage) {
                    this.costTracker.addStep(stage, model, usage, durationMs);
                    console.log(`  💰 Tokens: ${usage.prompt_tokens}in + ${usage.completion_tokens}out = ${usage.total_tokens} total`);
                }

                if (expectJSON) {
                    const parsed = tryParseJSON(content);
                    if (parsed) {
                        // Retornar JSON limpo (sem markdown wrapper)
                        const cleanJSON = JSON.stringify(parsed, null, 2);
                        return { raw: cleanJSON, parsed };
                    }
                    if (attempt < maxRetries) {
                        console.log(`  ⚠️ JSON inválido, retentando...`);
                        await sleep(2000 * attempt);
                        continue;
                    }
                }

                return { raw: content, parsed: null };
            } catch (error) {
                lastError = error;
                console.log(`  ⚠️ Tentativa ${attempt} falhou: ${error.message}`);
                if (attempt < maxRetries) {
                    await sleep(2000 * attempt);
                }
            }
        }

        throw lastError || new Error('All retries failed');
    }

    // ========================================================================
    // PIPELINE MARKETING (replica run-marketing.sh)
    // ========================================================================
    async runMarketing(briefingContent) {
        const BRAND_GUIDE = this.loadRole('BRAND_GUIDE.md');
        const BRAND_GUARDIAN = this.loadRole('BRAND_GUARDIAN.md');
        const results = {};

        // ETAPA 1: VALIDATOR
        this.emitProgress('VALIDATOR', 'running', { model: MARKETING_MODELS.VALIDATOR.primary.model });
        const validatorRole = this.loadRole('BRIEF_VALIDATOR.md');
        try {
            const { raw } = await this.callWithRetry(validatorRole,
                `BRIEFING:\n${briefingContent}\n\nAvalie o briefing conforme seu role. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'VALIDATOR' }
            );
            const filename = `${this.jobId}_01_VALIDATOR.json`;
            this.saveFile(filename, raw);
            this.saveLog(`${this.jobId}_01_VALIDATOR.log`, raw);
            results.VALIDATOR = raw;
            this.emitProgress('VALIDATOR', 'completed');
        } catch (e) {
            const filename = `${this.jobId}_01_VALIDATOR.json`;
            this.saveFile(filename, createPlaceholder('VALIDATOR', this.jobId, e.message));
            results.VALIDATOR = 'FAILED';
            this.emitProgress('VALIDATOR', 'failed', { error: e.message });
        }

        // ETAPA 2: AUDIENCE ANALYST
        this.emitProgress('AUDIENCE', 'running', { model: MARKETING_MODELS.AUDIENCE.primary.model });
        const audienceRole = this.loadRole('AUDIENCE_ANALYST.md');
        try {
            const { raw } = await this.callWithRetry(
                `# CONTEXTO DE MARCA OBRIGATÓRIO\n${BRAND_GUIDE}\n\n---\n\n${audienceRole}`,
                `BRIEFING PROPOSTO:\n${briefingContent}\n\nAvalie o alinhamento do briefing com a persona oficial E com o contexto de marca. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'AUDIENCE' }
            );
            const filename = `${this.jobId}_02_AUDIENCE.json`;
            this.saveFile(filename, raw);
            this.saveLog(`${this.jobId}_02_AUDIENCE.log`, raw);
            results.AUDIENCE = raw;
            this.emitProgress('AUDIENCE', 'completed');
        } catch (e) {
            const filename = `${this.jobId}_02_AUDIENCE.json`;
            this.saveFile(filename, createPlaceholder('AUDIENCE_ANALYST', this.jobId, e.message));
            results.AUDIENCE = 'FAILED';
            this.emitProgress('AUDIENCE', 'failed', { error: e.message });
        }

        // ETAPA 3: TOPIC RESEARCHER
        this.emitProgress('RESEARCH', 'running', { model: MARKETING_MODELS.RESEARCH.primary.model });
        const researchRole = this.loadRole('TOPIC_RESEARCHER.md');
        try {
            const { raw } = await this.callWithRetry(researchRole,
                `BRIEFING:\n${briefingContent}\n\nPÚBLICO-ALVO:\n${truncate(results.AUDIENCE, 1000)}\n\nPesquise conforme seu role. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'RESEARCH' }
            );
            const filename = `${this.jobId}_03_RESEARCH.json`;
            this.saveFile(filename, raw);
            this.saveLog(`${this.jobId}_03_RESEARCH.log`, raw);
            results.RESEARCH = raw;
            this.emitProgress('RESEARCH', 'completed');
        } catch (e) {
            const filename = `${this.jobId}_03_RESEARCH.json`;
            this.saveFile(filename, createPlaceholder('TOPIC_RESEARCHER', this.jobId, e.message));
            results.RESEARCH = 'FAILED';
            this.emitProgress('RESEARCH', 'failed', { error: e.message });
        }

        // ETAPA 4: CLAIMS CHECKER
        this.emitProgress('CLAIMS', 'running', { model: MARKETING_MODELS.CLAIMS.primary.model });
        const claimsRole = this.loadRole('CLAIMS_CHECKER.md');
        try {
            const { raw } = await this.callWithRetry(claimsRole,
                `BRIEFING:\n${briefingContent}\n\nRESEARCH:\n${truncate(results.RESEARCH, 1000)}\n\nValide claims conforme seu role. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'CLAIMS' }
            );
            const filename = `${this.jobId}_04_CLAIMS.json`;
            this.saveFile(filename, raw);
            this.saveLog(`${this.jobId}_04_CLAIMS.log`, raw);
            results.CLAIMS = raw;
            this.emitProgress('CLAIMS', 'completed');
        } catch (e) {
            const filename = `${this.jobId}_04_CLAIMS.json`;
            this.saveFile(filename, createPlaceholder('CLAIMS_CHECKER', this.jobId, e.message));
            results.CLAIMS = 'FAILED';
            this.emitProgress('CLAIMS', 'failed', { error: e.message });
        }

        // ETAPA 5: COPYWRITERS (3 em paralelo)
        this.emitProgress('COPYWRITERS', 'running');
        const copyRole = this.loadRole('COPYWRITER.md');

        // Contexto consolidado para copywriters
        const copyContext = `BRAND GUIDE (OBRIGATÓRIO):\n${BRAND_GUIDE}\n\n---\n\nBRIEFING:\n${truncate(briefingContent, 500)}\n\nCONTEXTO (Validator + Audience + Research + Claims):\n${truncate(results.AUDIENCE, 300)}\n${truncate(results.RESEARCH, 300)}\n${truncate(results.CLAIMS, 300)}`;

        const copyPromises = [
            { variant: 'A', style: 'Estilo direto e persuasivo', file: '05A_COPY_GPT', stage: 'COPY_A' },
            { variant: 'B', style: 'Estilo eficiente e data-driven', file: '05B_COPY_FLASH', stage: 'COPY_B' },
            { variant: 'C', style: 'Estilo narrativo e emocional', file: '05C_COPY_SONNET', stage: 'COPY_C' }
        ].map(async ({ variant, style, file, stage }) => {
            try {
                const { raw } = await this.callWithRetry(
                    `${copyRole}\n\nVARIAÇÃO: Copywriter ${variant} - ${style}`,
                    `${copyContext}\n\nEscreva a copy conforme o role COPYWRITER e RESPEITANDO o BRAND GUIDE.`,
                    { stage }
                );
                const filename = `${this.jobId}_${file}.md`;
                this.saveFile(filename, raw);
                this.saveLog(`${this.jobId}_${file}.log`, raw);
                return { variant, content: raw, success: true };
            } catch (e) {
                const filename = `${this.jobId}_${file}.md`;
                this.saveFile(filename, `# PLACEHOLDER - ${file}\nAgent failed: ${e.message}`);
                return { variant, content: '', success: false };
            }
        });

        const copies = await Promise.all(copyPromises);
        results.COPIES = copies;

        copies.forEach(c => {
            const status = c.success ? 'completed' : 'failed';
            this.emitProgress(`COPY_${c.variant}`, status);
        });

        // ETAPA 6: COPY SENIOR
        this.emitProgress('COPY_SENIOR', 'running', { model: MARKETING_MODELS.COPY_SENIOR.primary.model });
        const criticRole = this.loadRole('COPY_SENIOR.md');
        const copyA = truncate(copies.find(c => c.variant === 'A')?.content, 800);
        const copyB = truncate(copies.find(c => c.variant === 'B')?.content, 800);
        const copyC = truncate(copies.find(c => c.variant === 'C')?.content, 800);

        let criticOutput;
        try {
            const { raw } = await this.callWithRetry(
                `${criticRole}\n\n# BRAND GUARDIAN (REFERÊNCIA OBRIGATÓRIA)\n${BRAND_GUARDIAN}`,
                `BRIEFING:\n${truncate(briefingContent, 300)}\n\nCOPY A (GPT):\n${copyA}\n\nCOPY B (DeepSeek):\n${copyB}\n\nCOPY C (Sonnet):\n${copyC}\n\nAvalie as 3 copies, escolha a melhor, aplique ajustes e entregue copy_revisada final. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'COPY_SENIOR' }
            );
            const filename = `${this.jobId}_06_COPY_SENIOR.json`;
            this.saveFile(filename, raw);
            this.saveLog(`${this.jobId}_06_COPY_SENIOR.log`, raw);
            criticOutput = raw;
            results.COPY_SENIOR = raw;
            this.emitProgress('COPY_SENIOR', 'completed');
        } catch (e) {
            const filename = `${this.jobId}_06_COPY_SENIOR.json`;
            const ph = createPlaceholder('COPY_SENIOR', this.jobId, e.message);
            this.saveFile(filename, ph);
            criticOutput = ph;
            results.COPY_SENIOR = 'FAILED';
            this.emitProgress('COPY_SENIOR', 'failed', { error: e.message });
        }

        // ETAPA 7: WALL / FILTRO FINAL
        this.emitProgress('WALL', 'running', { model: MARKETING_MODELS.WALL.primary.model });
        const wallRole = this.loadRole('FILTRO_FINAL.md');

        // Extrair copy_revisada do Copy Senior
        let criticParsed = tryParseJSON(criticOutput);
        let copyRevisada = criticParsed?.copy_revisada || '';
        let criticWinner = criticParsed?.vencedor || 'C';
        let criticScore = criticParsed?.score_vencedor || 'N/A';
        let criticReason = truncate(criticParsed?.justificativa || '', 400);

        let wallOutput;
        try {
            const { raw } = await this.callWithRetry(
                `${wallRole}\n\n# BRAND GUARDIAN (REFERÊNCIA OBRIGATÓRIA)\n${BRAND_GUARDIAN}`,
                `BRIEFING:\n${truncate(briefingContent, 300)}\n\nCOPY FINAL (escolhida e revisada pelo Copy Senior):\nModelo vencedor: ${criticWinner} (score: ${criticScore})\nJustificativa: ${criticReason}\n\nTEXTO DA COPY:\n${copyRevisada}\n\nFaça a revisão final conforme seu role. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'WALL' }
            );
            const filename = `${this.jobId}_07_WALL.json`;
            this.saveFile(filename, raw);
            this.saveLog(`${this.jobId}_07_WALL.log`, raw);
            wallOutput = raw;
            results.WALL = raw;
            this.emitProgress('WALL', 'completed');
        } catch (e) {
            const filename = `${this.jobId}_07_WALL.json`;
            const ph = createPlaceholder('FILTRO_FINAL', this.jobId, e.message);
            this.saveFile(filename, ph);
            wallOutput = ph;
            results.WALL = 'FAILED';
            this.emitProgress('WALL', 'failed', { error: e.message });
        }

        // LOOP: Copy Senior ↔ Wall (se score < 80, max 3 loops)
        let wallParsed = tryParseJSON(wallOutput);
        let wallScore = wallParsed?.score_final || 0;
        let loopCount = 1;
        const MAX_LOOPS = 3;

        while (wallScore < 80 && loopCount < MAX_LOOPS && copyRevisada) {
            loopCount++;
            console.log(`🔄 Loop ${loopCount}/${MAX_LOOPS} - Wall rejeitou (score: ${wallScore}), Copy Senior revisando...`);
            this.emitProgress(`LOOP_${loopCount}`, 'running', { wallScore });

            // Copy Senior revisa
            try {
                const { raw } = await this.callWithRetry(
                    `${criticRole}\n\n# BRAND GUARDIAN (REFERÊNCIA OBRIGATÓRIA)\n${BRAND_GUARDIAN}`,
                    `CONTEXTO DO LOOP:\n- Revisão ${loopCount} de ${MAX_LOOPS}\n- Wall rejeitou com score ${wallScore}/100 (precisa 80+)\n\nCOPY ATUAL:\n${copyRevisada}\n\nFEEDBACK DO WALL:\n${wallOutput}\n\nAplique os ajustes necessários e gere copy_revisada melhorada. Responda APENAS com JSON válido.`,
                    { expectJSON: true, stage: 'COPY_SENIOR' }
                );
                const filename = `${this.jobId}_06_COPY_SENIOR_v${loopCount}.json`;
                this.saveFile(filename, raw);
                this.saveLog(`${this.jobId}_06_COPY_SENIOR_v${loopCount}.log`, raw);

                const parsed = tryParseJSON(raw);
                copyRevisada = parsed?.copy_revisada || '';
                if (!copyRevisada) {
                    console.log(`⚠️ Copy Senior v${loopCount} não gerou copy_revisada - abortando loop`);
                    break;
                }
            } catch (e) {
                console.log(`❌ Copy Senior v${loopCount} falhou - abortando loop`);
                break;
            }

            // Wall reavalia
            try {
                const { raw } = await this.callWithRetry(
                    `${wallRole}\n\n# BRAND GUARDIAN\n${BRAND_GUARDIAN}`,
                    `COPY REVISADA (versão ${loopCount}):\n${copyRevisada}\n\nCONTEXTO:\nEsta é a avaliação ${loopCount} após feedback anterior. Seja justo: se os ajustes foram aplicados, aprove. Responda APENAS com JSON válido.`,
                    { expectJSON: true, stage: 'WALL' }
                );
                const filename = `${this.jobId}_07_WALL_v${loopCount}.json`;
                this.saveFile(filename, raw);
                this.saveLog(`${this.jobId}_07_WALL_v${loopCount}.log`, raw);
                wallOutput = raw;
                wallParsed = tryParseJSON(raw);
                wallScore = wallParsed?.score_final || 0;
                console.log(`📊 Wall Score v${loopCount}: ${wallScore}/100`);
                this.emitProgress(`WALL_v${loopCount}`, wallScore >= 80 ? 'completed' : 'failed', { wallScore });
            } catch (e) {
                console.log(`❌ Wall v${loopCount} falhou - abortando loop`);
                break;
            }
        }

        // FINAL: Montar arquivo consolidado
        const finalContent = this.buildMarketingFinal(briefingContent, results, criticOutput, wallOutput, copyRevisada, criticWinner, wallScore);
        this.saveFile(`${this.jobId}_FINAL.md`, finalContent);
        this.emitProgress('FINAL', 'completed', { wallScore });

        return results;
    }

    buildMarketingFinal(briefing, results, criticOutput, wallOutput, copyRevisada, winner, wallScore) {
        const criticParsed = tryParseJSON(criticOutput);
        const alteracoes = criticParsed?.alteracoes_aplicadas || [];

        let final = `# COPY FINAL (vencedora: ${winner} — revisada pelo Copy Senior)\n\n`;
        final += copyRevisada || '(Copy não disponível)';
        final += `\n\n---\n\n## ALTERAÇÕES APLICADAS\n`;
        alteracoes.forEach(a => { final += `- ${a}\n`; });
        final += `\n---\n\n## WALL (JSON)\n${wallOutput || 'N/A'}\n`;
        final += `\n## SCORE FINAL: ${wallScore}/100\n`;
        return final;
    }

    // ========================================================================
    // PIPELINE IDEIAS (replica run-ideias.sh)
    // ========================================================================
    async runIdeias(briefingContent) {
        const results = {};

        // ETAPA 1: PAIN CHECK
        this.emitProgress('PAIN_CHECK', 'running', { model: IDEIAS_MODELS.PAIN_CHECK.primary.model });
        try {
            const { raw } = await this.callWithRetry(this.loadRole('PAIN_CHECK.md'),
                `IDEIA:\n${briefingContent}\n\nValide se a dor é real e tem demanda. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'PAIN_CHECK' }
            );
            this.saveFile(`${this.jobId}_PAIN_CHECK.json`, raw);
            this.saveLog(`${this.jobId}_01_PAIN_CHECK.log`, raw);
            results.PAIN_CHECK = raw;
            this.emitProgress('PAIN_CHECK', 'completed');
        } catch (e) {
            this.saveFile(`${this.jobId}_PAIN_CHECK.json`, createPlaceholder('PAIN_CHECK', this.jobId, e.message));
            this.emitProgress('PAIN_CHECK', 'failed', { error: e.message });
        }

        // ETAPA 2: MARKET SCAN
        this.emitProgress('MARKET_SCAN', 'running', { model: IDEIAS_MODELS.MARKET_SCAN.primary.model });
        try {
            const { raw } = await this.callWithRetry(this.loadRole('MARKET_SCAN.md'),
                `IDEIA:\n${briefingContent}\n\nPAIN CHECK:\n${truncate(results.PAIN_CHECK, 800)}\n\nAnalise mercado e concorrência. Responda em Markdown estruturado.`,
                { stage: 'MARKET_SCAN' }
            );
            this.saveFile(`${this.jobId}_MARKET_SCAN.md`, raw);
            this.saveLog(`${this.jobId}_02_MARKET_SCAN.log`, raw);
            results.MARKET_SCAN = raw;
            this.emitProgress('MARKET_SCAN', 'completed');
        } catch (e) {
            this.saveFile(`${this.jobId}_MARKET_SCAN.md`, `# MARKET SCAN - FAILED\n${e.message}`);
            this.emitProgress('MARKET_SCAN', 'failed', { error: e.message });
        }

        // ETAPA 3: ANGEL + DEVIL (paralelo)
        this.emitProgress('ANGEL_GEN', 'running', { model: IDEIAS_MODELS.ANGEL_GEN.primary.model });
        this.emitProgress('DEVIL_GEN', 'running', { model: IDEIAS_MODELS.DEVIL_GEN.primary.model });

        const angelDevil = await Promise.all([
            this.callWithRetry(this.loadRole('ANGEL_GEN.md'),
                `IDEIA:\n${briefingContent}\n\nPAIN CHECK:\n${truncate(results.PAIN_CHECK, 500)}\n\nMARKET SCAN:\n${truncate(results.MARKET_SCAN, 500)}\n\nDefenda a ideia com argumentos fortes. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'ANGEL_GEN' }
            ).then(({ raw }) => {
                this.saveFile(`${this.jobId}_ANGEL_GEN.json`, raw);
                this.saveLog(`${this.jobId}_03A_ANGEL_GEN.log`, raw);
                results.ANGEL_GEN = raw;
                this.emitProgress('ANGEL_GEN', 'completed');
                return raw;
            }).catch(e => {
                this.saveFile(`${this.jobId}_ANGEL_GEN.json`, createPlaceholder('ANGEL_GEN', this.jobId, e.message));
                this.emitProgress('ANGEL_GEN', 'failed', { error: e.message });
                return 'FAILED';
            }),

            this.callWithRetry(this.loadRole('DEVIL_GEN.md'),
                `IDEIA:\n${briefingContent}\n\nPAIN CHECK:\n${truncate(results.PAIN_CHECK, 500)}\n\nMARKET SCAN:\n${truncate(results.MARKET_SCAN, 500)}\n\nAtaque a ideia sem piedade. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'DEVIL_GEN' }
            ).then(({ raw }) => {
                this.saveFile(`${this.jobId}_DEVIL_GEN.json`, raw);
                this.saveLog(`${this.jobId}_03B_DEVIL_GEN.log`, raw);
                results.DEVIL_GEN = raw;
                this.emitProgress('DEVIL_GEN', 'completed');
                return raw;
            }).catch(e => {
                this.saveFile(`${this.jobId}_DEVIL_GEN.json`, createPlaceholder('DEVIL_GEN', this.jobId, e.message));
                this.emitProgress('DEVIL_GEN', 'failed', { error: e.message });
                return 'FAILED';
            })
        ]);

        // ETAPA 4: VIABILITY
        this.emitProgress('VIABILITY', 'running', { model: IDEIAS_MODELS.VIABILITY.primary.model });
        try {
            const { raw } = await this.callWithRetry(this.loadRole('VIABILITY.md'),
                `IDEIA:\n${briefingContent}\n\nPAIN CHECK:\n${truncate(results.PAIN_CHECK, 500)}\n\nMARKET SCAN:\n${truncate(results.MARKET_SCAN, 500)}\n\nANGEL:\n${truncate(results.ANGEL_GEN, 500)}\n\nDEVIL:\n${truncate(results.DEVIL_GEN, 500)}\n\nDê o veredito final GO/NO-GO. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'VIABILITY' }
            );
            this.saveFile(`${this.jobId}_VIABILITY.json`, raw);
            this.saveLog(`${this.jobId}_04_VIABILITY.log`, raw);
            results.VIABILITY = raw;
            this.emitProgress('VIABILITY', 'completed');
        } catch (e) {
            this.saveFile(`${this.jobId}_VIABILITY.json`, createPlaceholder('VIABILITY', this.jobId, e.message));
            this.emitProgress('VIABILITY', 'failed', { error: e.message });
        }

        // FINAL
        let finalContent = `# Análise de Ideia - Resultado Final\n\n`;
        finalContent += `**Job ID:** ${this.jobId}\n**Modelo:** ${this.model}\n\n---\n\n`;
        for (const [k, v] of Object.entries(results)) {
            finalContent += `## ${k}\n\n${v}\n\n---\n\n`;
        }
        this.saveFile(`${this.jobId}_FINAL.md`, finalContent);

        return results;
    }

    // ========================================================================
    // PIPELINE PROJETOS (replica run-projetos.sh)
    // ========================================================================
    async runProjetos(briefingContent) {
        const results = {};

        // ETAPA 1: BRAND DIGEST
        this.emitProgress('BRAND_DIGEST', 'running', { model: PROJETOS_MODELS.BRAND_DIGEST.primary.model });
        try {
            const { raw } = await this.callWithRetry(this.loadRole('BRAND_DIGEST.md'),
                `BRIEFING DO PROJETO:\n${briefingContent}\n\nExtraia DNA, tom e assets da marca. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'BRAND_DIGEST' }
            );
            this.saveFile(`${this.jobId}_01_BRAND_DIGEST.json`, raw);
            results.BRAND_DIGEST = raw;
            this.emitProgress('BRAND_DIGEST', 'completed');
        } catch (e) {
            this.saveFile(`${this.jobId}_01_BRAND_DIGEST.json`, createPlaceholder('BRAND_DIGEST', this.jobId, e.message));
            this.emitProgress('BRAND_DIGEST', 'failed', { error: e.message });
        }

        // ETAPA 2: CREATIVE IDEATION (3 variantes em paralelo)
        this.emitProgress('CREATIVE_IDEATION', 'running');
        const creativeRole = this.loadRole('CREATIVE_IDEATION.md');
        const creativeContext = `BRIEFING:\n${briefingContent}\n\nBRAND DIGEST:\n${truncate(results.BRAND_DIGEST, 800)}`;

        const creativeStages = { A: 'CREATIVE_A', B: 'CREATIVE_B', C: 'CREATIVE_C' };
        const creatives = await Promise.all(['A', 'B', 'C'].map(async (variant) => {
            try {
                const { raw } = await this.callWithRetry(
                    `${creativeRole}\n\nVARIAÇÃO: Conceito ${variant}`,
                    `${creativeContext}\n\nGere um conceito criativo. Responda APENAS com JSON válido.`,
                    { expectJSON: true, stage: creativeStages[variant] }
                );
                this.saveFile(`${this.jobId}_02${variant}_CREATIVE.json`, raw);
                return { variant, content: raw, success: true };
            } catch (e) {
                this.saveFile(`${this.jobId}_02${variant}_CREATIVE.json`, createPlaceholder('CREATIVE_IDEATION', this.jobId, e.message));
                return { variant, content: '', success: false };
            }
        }));
        results.CREATIVES = creatives;
        this.emitProgress('CREATIVE_IDEATION', 'completed');

        // ETAPA 3: CONCEPT CRITIC
        this.emitProgress('CONCEPT_CRITIC', 'running', { model: PROJETOS_MODELS.CONCEPT_CRITIC.primary.model });
        try {
            const creativeSummary = creatives.map(c => `Conceito ${c.variant}:\n${truncate(c.content, 500)}`).join('\n\n');
            const { raw } = await this.callWithRetry(this.loadRole('CONCEPT_CRITIC.md'),
                `BRIEFING:\n${truncate(briefingContent, 500)}\n\nBRAND DIGEST:\n${truncate(results.BRAND_DIGEST, 600)}\n\n${creativeSummary}\n\nAvalie e escolha o melhor conceito considerando alinhamento com a marca. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'CONCEPT_CRITIC' }
            );
            this.saveFile(`${this.jobId}_03_CONCEPT_CRITIC.json`, raw);
            results.CONCEPT_CRITIC = raw;
            this.emitProgress('CONCEPT_CRITIC', 'completed');
        } catch (e) {
            this.saveFile(`${this.jobId}_03_CONCEPT_CRITIC.json`, createPlaceholder('CONCEPT_CRITIC', this.jobId, e.message));
            this.emitProgress('CONCEPT_CRITIC', 'failed', { error: e.message });
        }

        // ETAPA 4-6: LOOP EXECUTION ↔ DIRECTOR (max 3x, score < 85 triggers retry)
        const executionRole = this.loadRole('EXECUTION_DESIGN.md');
        const proposalRole = this.loadRole('PROPOSAL_WRITER.md');
        const directorRole = this.loadRole('DIRECTOR.md');
        const MAX_PROJ_LOOPS = 3;
        let directorFeedback = '';

        for (let loop = 1; loop <= MAX_PROJ_LOOPS; loop++) {
            const suffix = loop > 1 ? `_v${loop}` : '';

            // EXECUTION DESIGN
            this.emitProgress('EXECUTION_DESIGN', 'running', { model: PROJETOS_MODELS.EXECUTION_DESIGN.primary.model });
            try {
                const execPrompt = loop === 1
                    ? `BRIEFING:\n${truncate(briefingContent, 500)}\n\nCONCEITO VENCEDOR:\n${truncate(results.CONCEPT_CRITIC, 800)}\n\nDefina direção visual e técnica. Responda APENAS com JSON válido.`
                    : `BRIEFING:\n${truncate(briefingContent, 500)}\n\nCONCEITO VENCEDOR:\n${truncate(results.CONCEPT_CRITIC, 600)}\n\nFEEDBACK DO DIRECTOR (revisão ${loop}):\n${truncate(directorFeedback, 800)}\n\nRefine a direção visual e técnica com base no feedback. Responda APENAS com JSON válido.`;
                const { raw } = await this.callWithRetry(executionRole, execPrompt, { expectJSON: true, stage: 'EXECUTION_DESIGN' });
                this.saveFile(`${this.jobId}_04_EXECUTION_DESIGN${suffix}.json`, raw);
                results.EXECUTION_DESIGN = raw;
                this.emitProgress('EXECUTION_DESIGN', 'completed');
            } catch (e) {
                this.saveFile(`${this.jobId}_04_EXECUTION_DESIGN${suffix}.json`, createPlaceholder('EXECUTION_DESIGN', this.jobId, e.message));
                this.emitProgress('EXECUTION_DESIGN', 'failed', { error: e.message });
                break;
            }

            // PROPOSAL WRITER
            this.emitProgress('PROPOSAL_WRITER', 'running', { model: PROJETOS_MODELS.PROPOSAL.primary.model });
            try {
                const { raw } = await this.callWithRetry(proposalRole,
                    `BRIEFING:\n${truncate(briefingContent, 500)}\n\nCONCEITO:\n${truncate(results.CONCEPT_CRITIC, 500)}\n\nEXECUÇÃO:\n${truncate(results.EXECUTION_DESIGN, 500)}\n\nEscreva a proposta comercial completa. Responda em Markdown.`,
                    { stage: 'PROPOSAL' }
                );
                this.saveFile(`${this.jobId}_05_PROPOSAL${suffix}.md`, raw);
                results.PROPOSAL = raw;
                this.emitProgress('PROPOSAL_WRITER', 'completed');
            } catch (e) {
                this.saveFile(`${this.jobId}_05_PROPOSAL${suffix}.md`, `# PROPOSAL - FAILED\n${e.message}`);
                this.emitProgress('PROPOSAL_WRITER', 'failed', { error: e.message });
                break;
            }

            // DIRECTOR
            this.emitProgress('DIRECTOR', 'running', { model: PROJETOS_MODELS.DIRECTOR.primary.model });
            try {
                const { raw } = await this.callWithRetry(directorRole,
                    `BRIEFING:\n${truncate(briefingContent, 500)}\n\nPROPOSTA:\n${truncate(results.PROPOSAL, 800)}\n\nEXECUÇÃO:\n${truncate(results.EXECUTION_DESIGN, 500)}\n\nAvalie a execução audiovisual. Responda APENAS com JSON válido.`,
                    { expectJSON: true, stage: 'DIRECTOR' }
                );
                this.saveFile(`${this.jobId}_06_DIRECTOR${suffix}.json`, raw);
                results.DIRECTOR = raw;

                const dirParsed = tryParseJSON(raw);
                const dirScore = dirParsed?.score || dirParsed?.score_final || 0;
                const dirVerdict = (dirParsed?.verdict || dirParsed?.veredito || '').toUpperCase();

                if (dirScore >= 85 || dirVerdict.includes('APROV')) {
                    console.log(`✅ Director aprovou (score: ${dirScore}, loop ${loop}/${MAX_PROJ_LOOPS})`);
                    this.emitProgress('DIRECTOR', 'completed', { score: dirScore });
                    break;
                } else if (loop < MAX_PROJ_LOOPS) {
                    console.log(`🔄 Director rejeitou (score: ${dirScore}), loop ${loop + 1}/${MAX_PROJ_LOOPS}...`);
                    directorFeedback = raw;
                    this.emitProgress('DIRECTOR', 'failed', { score: dirScore, looping: true });
                } else {
                    console.log(`⚠️ Director não aprovou após ${MAX_PROJ_LOOPS} loops (score: ${dirScore}). Seguindo com resultado atual.`);
                    this.emitProgress('DIRECTOR', 'completed', { score: dirScore, maxLoops: true });
                }
            } catch (e) {
                this.saveFile(`${this.jobId}_06_DIRECTOR${suffix}.json`, createPlaceholder('DIRECTOR', this.jobId, e.message));
                this.emitProgress('DIRECTOR', 'failed', { error: e.message });
                break;
            }
        }

        // FINAL
        let finalContent = `# Projeto - Resultado Final\n\n**Job ID:** ${this.jobId}\n\n---\n\n`;
        for (const [k, v] of Object.entries(results)) {
            if (k === 'CREATIVES') continue;
            finalContent += `## ${k}\n\n${v}\n\n---\n\n`;
        }
        this.saveFile(`${this.jobId}_FINAL.md`, finalContent);

        return results;
    }

    // ========================================================================
    // PIPELINE ORIGINAIS (replica run-originais.sh)
    // ========================================================================
    async runOriginais(briefingContent) {
        const results = {};

        // ETAPA 1: TRIAGE (sequencial)
        this.emitProgress('TRIAGE', 'running');
        try {
            const { raw } = await this.callWithRetry(this.loadRole('TRIAGE_ORIGINAIS.md'),
                `PROJETO:\n${briefingContent}\n\nFaça a triagem do projeto. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'TRIAGE' }
            );
            this.saveFile(`${this.jobId}_TRIAGE.json`, raw);
            this.saveLog(`${this.jobId}_TRIAGE.log`, raw);
            results.TRIAGE = raw;
            this.emitProgress('TRIAGE', 'completed');
        } catch (e) {
            this.saveFile(`${this.jobId}_TRIAGE.json`, createPlaceholder('TRIAGE', this.jobId, e.message));
            this.emitProgress('TRIAGE', 'failed', { error: e.message });
        }

        // ETAPA 2: CREATIVE_DOCTOR + SALES_SHARK (paralelo)
        this.emitProgress('CREATIVE_DOCTOR', 'running', { model: ORIGINAIS_MODELS.CREATIVE_DOCTOR.primary.model });
        this.emitProgress('SALES_SHARK', 'running', { model: ORIGINAIS_MODELS.SALES_SHARK.primary.model });

        const triageContext = `PROJETO:\n${briefingContent}\n\nTRIAGE:\n${truncate(results.TRIAGE, 800)}`;

        const [doctorResult, sharkResult] = await Promise.all([
            this.callWithRetry(this.loadRole('CREATIVE_DOCTOR_ORIGINAIS.md'),
                `${triageContext}\n\nAvalie e refine o conceito criativo. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'CREATIVE_DOCTOR' }
            ).then(({ raw }) => {
                this.saveFile(`${this.jobId}_CREATIVE_DOCTOR.json`, raw);
                this.saveLog(`${this.jobId}_CREATIVE_DOCTOR.log`, raw);
                results.CREATIVE_DOCTOR = raw;
                this.emitProgress('CREATIVE_DOCTOR', 'completed');
                return raw;
            }).catch(e => {
                this.saveFile(`${this.jobId}_CREATIVE_DOCTOR.json`, createPlaceholder('CREATIVE_DOCTOR', this.jobId, e.message));
                this.emitProgress('CREATIVE_DOCTOR', 'failed', { error: e.message });
                return 'FAILED';
            }),

            this.callWithRetry(this.loadRole('SALES_SHARK_ORIGINAIS.md'),
                `${triageContext}\n\nAnalise o potencial comercial. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'SALES_SHARK' }
            ).then(({ raw }) => {
                this.saveFile(`${this.jobId}_SALES_SHARK.json`, raw);
                this.saveLog(`${this.jobId}_SALES_SHARK.log`, raw);
                results.SALES_SHARK = raw;
                this.emitProgress('SALES_SHARK', 'completed');
                return raw;
            }).catch(e => {
                this.saveFile(`${this.jobId}_SALES_SHARK.json`, createPlaceholder('SALES_SHARK', this.jobId, e.message));
                this.emitProgress('SALES_SHARK', 'failed', { error: e.message });
                return 'FAILED';
            })
        ]);

        // ETAPA 3: ANGEL + DEMON (paralelo)
        this.emitProgress('ANGEL', 'running', { model: ORIGINAIS_MODELS.ANGEL.primary.model });
        this.emitProgress('DEMON', 'running', { model: ORIGINAIS_MODELS.DEMON.primary.model });

        const debateContext = `PROJETO:\n${briefingContent}\n\nTRIAGE:\n${truncate(results.TRIAGE, 500)}\n\nCREATIVE DOCTOR:\n${truncate(results.CREATIVE_DOCTOR, 500)}\n\nSALES SHARK:\n${truncate(results.SALES_SHARK, 500)}`;

        await Promise.all([
            this.callWithRetry(this.loadRole('ANGEL_ORIGINAIS.md'),
                `${debateContext}\n\nDefenda o projeto com argumentos fortes. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'ANGEL' }
            ).then(({ raw }) => {
                this.saveFile(`${this.jobId}_ANGEL.json`, raw);
                this.saveLog(`${this.jobId}_ANGEL.log`, raw);
                results.ANGEL = raw;
                this.emitProgress('ANGEL', 'completed');
            }).catch(e => {
                this.saveFile(`${this.jobId}_ANGEL.json`, createPlaceholder('ANGEL', this.jobId, e.message));
                this.emitProgress('ANGEL', 'failed', { error: e.message });
            }),

            this.callWithRetry(this.loadRole('DEMON_ORIGINAIS.md'),
                `${debateContext}\n\nAtaque o projeto sem piedade. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'DEMON' }
            ).then(({ raw }) => {
                this.saveFile(`${this.jobId}_DEMON.json`, raw);
                this.saveLog(`${this.jobId}_DEMON.log`, raw);
                results.DEMON = raw;
                this.emitProgress('DEMON', 'completed');
            }).catch(e => {
                this.saveFile(`${this.jobId}_DEMON.json`, createPlaceholder('DEMON', this.jobId, e.message));
                this.emitProgress('DEMON', 'failed', { error: e.message });
            })
        ]);

        // ETAPA 4: DOCTOR FINAL (sequencial — recebe tudo)
        this.emitProgress('DOCTOR_FINAL', 'running', { model: ORIGINAIS_MODELS.DOCTOR_FINAL.primary.model });
        try {
            const { raw } = await this.callWithRetry(this.loadRole('DOCTOR_FINAL_ORIGINAIS.md'),
                `PROJETO:\n${truncate(briefingContent, 500)}\n\nTRIAGE:\n${truncate(results.TRIAGE, 500)}\n\nCREATIVE DOCTOR:\n${truncate(results.CREATIVE_DOCTOR, 500)}\n\nSALES SHARK:\n${truncate(results.SALES_SHARK, 500)}\n\nANGEL:\n${truncate(results.ANGEL, 500)}\n\nDEMON:\n${truncate(results.DEMON, 500)}\n\nDê o parecer final do projeto. Responda APENAS com JSON válido.`,
                { expectJSON: true, stage: 'DOCTOR_FINAL' }
            );
            this.saveFile(`${this.jobId}_DOCTOR_FINAL.json`, raw);
            this.saveLog(`${this.jobId}_DOCTOR_FINAL.log`, raw);
            results.DOCTOR_FINAL = raw;
            this.emitProgress('DOCTOR_FINAL', 'completed');
        } catch (e) {
            this.saveFile(`${this.jobId}_DOCTOR_FINAL.json`, createPlaceholder('DOCTOR_FINAL', this.jobId, e.message));
            this.emitProgress('DOCTOR_FINAL', 'failed', { error: e.message });
        }

        let finalContent = `# Originais - Resultado Final\n\n**Job ID:** ${this.jobId}\n\n---\n\n`;
        for (const [k, v] of Object.entries(results)) {
            finalContent += `## ${k}\n\n${v}\n\n---\n\n`;
        }
        this.saveFile(`${this.jobId}_FINAL.md`, finalContent);

        return results;
    }

    // ========================================================================
    // DISPATCHER
    // ========================================================================
    async run(briefingContent) {
        console.log(`\n🚀 Pipeline ${this.mode.toUpperCase()} iniciando | Job: ${this.jobId} | Model: ${this.model}`);
        this.emitProgress('PIPELINE', 'started', { mode: this.mode, model: this.model });

        // Salvar briefing input (acende node BRIEFING_INPUT / PROJECT_INPUT)
        this.saveFile(`${this.jobId}_BRIEFING_INPUT.md`, briefingContent);

        // Acender node RAW_IDEA (ideias) ou PROJECT_INPUT (originais) imediatamente
        if (this.mode === 'ideias') {
            this.saveFile(`${this.jobId}_RAW_IDEA.md`, briefingContent);
            this.emitProgress('RAW_IDEA', 'completed');
        }

        let results;
        try {
            switch (this.mode) {
                case 'marketing':
                    results = await this.runMarketing(briefingContent);
                    break;
                case 'ideias':
                    results = await this.runIdeias(briefingContent);
                    break;
                case 'projetos':
                    results = await this.runProjetos(briefingContent);
                    break;
                case 'originais':
                    results = await this.runOriginais(briefingContent);
                    break;
                default:
                    throw new Error(`Modo desconhecido: ${this.mode}`);
            }

            // Save cost report
            const costReport = this.costTracker.getReport();
            this.costTracker.save(this.wipDir);
            console.log(`💰 Custo total: $${costReport.summary.total_cost_usd} (${costReport.summary.total_tokens} tokens)`);

            this.emitProgress('PIPELINE', 'completed', {
                mode: this.mode,
                cost: costReport.summary
            });
            console.log(`✅ Pipeline ${this.mode.toUpperCase()} concluído | Job: ${this.jobId}`);

            return { jobId: this.jobId, mode: this.mode, status: 'completed', stages: results, cost: costReport.summary };
        } catch (error) {
            // Save partial cost report even on failure
            try {
                this.costTracker.save(this.wipDir);
            } catch (_) { /* ignore save errors */ }

            this.emitProgress('PIPELINE', 'failed', { error: error.message });
            console.error(`❌ Pipeline ${this.mode.toUpperCase()} falhou: ${error.message}`);
            return { jobId: this.jobId, mode: this.mode, status: 'failed', error: error.message };
        }
    }
}

// ============================================================================
// HANDLER PARA SERVER.JS
// ============================================================================

async function handlePipelineRun(options) {
    const { briefing, mode, jobId, io, model, emitStateUpdate } = options;

    const runner = new PipelineRunner({
        mode: mode || 'marketing',
        jobId: jobId || Date.now().toString(),
        io,
        model: model || 'google/gemini-3-flash-preview',
        emitStateUpdate: emitStateUpdate || (() => { }),
        historyRoot: process.env.RAILWAY_ENVIRONMENT
            ? '/api/history'
            : path.join(__dirname, '..', 'history')
    });

    return await runner.run(briefing);
}

module.exports = {
    PipelineRunner,
    handlePipelineRun
};
