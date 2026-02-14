// Pipeline Runner Autônomo - Brick AI War Room
// Replica EXATAMENTE o comportamento de run-marketing.sh, run-ideias.sh, etc.
// Mas usando OpenRouter API em vez de openclaw agent

const fs = require('fs');
const path = require('path');
const { OpenRouterClient } = require('./openrouter-client');

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
        this.client = new OpenRouterClient();
        this.mode = options.mode || 'marketing';
        this.jobId = options.jobId;
        this.io = options.io || null;
        this.rolesDir = options.rolesDir || path.join(__dirname, '..', 'roles');
        this.historyRoot = options.historyRoot || path.join(__dirname, '..', 'history');
        this.wipDir = path.join(this.historyRoot, this.mode, 'wip');
        this.logsDir = path.join(this.wipDir, 'logs');
        this.model = options.model || 'openrouter/free';
        this.emitStateUpdate = options.emitStateUpdate || (() => {});
        this.maxRetries = 3;

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

    // Chamar agente com retry
    async callWithRetry(systemPrompt, userPrompt, options = {}) {
        const { maxRetries = this.maxRetries, expectJSON = false } = options;
        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            try {
                console.log(`  >> Tentativa ${attempt}/${maxRetries}`);
                const response = await this.client.callAgent(systemPrompt, userPrompt, this.model);

                if (expectJSON) {
                    const parsed = tryParseJSON(response);
                    if (parsed) return { raw: response, parsed };
                    if (attempt < maxRetries) {
                        console.log(`  ⚠️ JSON inválido, retentando...`);
                        await sleep(2000 * attempt);
                        continue;
                    }
                }

                return { raw: response, parsed: null };
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
        this.emitProgress('VALIDATOR', 'running');
        const validatorRole = this.loadRole('BRIEF_VALIDATOR.md');
        try {
            const { raw } = await this.callWithRetry(validatorRole,
                `BRIEFING:\n${briefingContent}\n\nAvalie o briefing conforme seu role. Responda APENAS com JSON válido.`,
                { expectJSON: true }
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
        this.emitProgress('AUDIENCE', 'running');
        const audienceRole = this.loadRole('AUDIENCE_ANALYST.md');
        try {
            const { raw } = await this.callWithRetry(
                `# CONTEXTO DE MARCA OBRIGATÓRIO\n${BRAND_GUIDE}\n\n---\n\n${audienceRole}`,
                `BRIEFING PROPOSTO:\n${briefingContent}\n\nAvalie o alinhamento do briefing com a persona oficial E com o contexto de marca. Responda APENAS com JSON válido.`,
                { expectJSON: true }
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
        this.emitProgress('RESEARCH', 'running');
        const researchRole = this.loadRole('TOPIC_RESEARCHER.md');
        try {
            const { raw } = await this.callWithRetry(researchRole,
                `BRIEFING:\n${briefingContent}\n\nPÚBLICO-ALVO:\n${truncate(results.AUDIENCE, 1000)}\n\nPesquise conforme seu role. Responda APENAS com JSON válido.`,
                { expectJSON: true }
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
        this.emitProgress('CLAIMS', 'running');
        const claimsRole = this.loadRole('CLAIMS_CHECKER.md');
        try {
            const { raw } = await this.callWithRetry(claimsRole,
                `BRIEFING:\n${briefingContent}\n\nRESEARCH:\n${truncate(results.RESEARCH, 1000)}\n\nValide claims conforme seu role. Responda APENAS com JSON válido.`,
                { expectJSON: true }
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
            { variant: 'A', style: 'Estilo direto e persuasivo', file: '05A_COPY_GPT' },
            { variant: 'B', style: 'Estilo eficiente e data-driven', file: '05B_COPY_FLASH' },
            { variant: 'C', style: 'Estilo narrativo e emocional', file: '05C_COPY_SONNET' }
        ].map(async ({ variant, style, file }) => {
            try {
                const { raw } = await this.callWithRetry(
                    `${copyRole}\n\nVARIAÇÃO: Copywriter ${variant} - ${style}`,
                    `${copyContext}\n\nEscreva a copy conforme o role COPYWRITER e RESPEITANDO o BRAND GUIDE.`
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
        this.emitProgress('COPY_SENIOR', 'running');
        const criticRole = this.loadRole('COPY_SENIOR.md');
        const copyA = truncate(copies.find(c => c.variant === 'A')?.content, 800);
        const copyB = truncate(copies.find(c => c.variant === 'B')?.content, 800);
        const copyC = truncate(copies.find(c => c.variant === 'C')?.content, 800);

        let criticOutput;
        try {
            const { raw } = await this.callWithRetry(criticRole,
                `BRIEFING:\n${truncate(briefingContent, 300)}\n\nCOPY A (GPT):\n${copyA}\n\nCOPY B (Flash):\n${copyB}\n\nCOPY C (Sonnet):\n${copyC}\n\nAvalie as 3 copies, escolha a melhor, aplique ajustes e entregue copy_revisada final. Responda APENAS com JSON válido.`,
                { expectJSON: true }
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
        this.emitProgress('WALL', 'running');
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
                { expectJSON: true }
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
                const { raw } = await this.callWithRetry(criticRole,
                    `CONTEXTO DO LOOP:\n- Revisão ${loopCount} de ${MAX_LOOPS}\n- Wall rejeitou com score ${wallScore}/100 (precisa 80+)\n\nCOPY ATUAL:\n${copyRevisada}\n\nFEEDBACK DO WALL:\n${wallOutput}\n\nAplique os ajustes necessários e gere copy_revisada melhorada. Responda APENAS com JSON válido.`,
                    { expectJSON: true }
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
                    { expectJSON: true }
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
        this.emitProgress('PAIN_CHECK', 'running');
        try {
            const { raw } = await this.callWithRetry(this.loadRole('PAIN_CHECK.md'),
                `IDEIA:\n${briefingContent}\n\nValide se a dor é real e tem demanda. Responda APENAS com JSON válido.`,
                { expectJSON: true }
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
        this.emitProgress('MARKET_SCAN', 'running');
        try {
            const { raw } = await this.callWithRetry(this.loadRole('MARKET_SCAN.md'),
                `IDEIA:\n${briefingContent}\n\nPAIN CHECK:\n${truncate(results.PAIN_CHECK, 800)}\n\nAnalise mercado e concorrência. Responda em Markdown estruturado.`
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
        this.emitProgress('ANGEL_GEN', 'running');
        this.emitProgress('DEVIL_GEN', 'running');
        
        const angelDevil = await Promise.all([
            this.callWithRetry(this.loadRole('ANGEL_GEN.md'),
                `IDEIA:\n${briefingContent}\n\nPAIN CHECK:\n${truncate(results.PAIN_CHECK, 500)}\n\nMARKET SCAN:\n${truncate(results.MARKET_SCAN, 500)}\n\nDefenda a ideia com argumentos fortes. Responda APENAS com JSON válido.`,
                { expectJSON: true }
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
                { expectJSON: true }
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
        this.emitProgress('VIABILITY', 'running');
        try {
            const { raw } = await this.callWithRetry(this.loadRole('VIABILITY.md'),
                `IDEIA:\n${briefingContent}\n\nPAIN CHECK:\n${truncate(results.PAIN_CHECK, 500)}\n\nMARKET SCAN:\n${truncate(results.MARKET_SCAN, 500)}\n\nANGEL:\n${truncate(results.ANGEL_GEN, 500)}\n\nDEVIL:\n${truncate(results.DEVIL_GEN, 500)}\n\nDê o veredito final GO/NO-GO. Responda APENAS com JSON válido.`,
                { expectJSON: true }
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
        this.emitProgress('BRAND_DIGEST', 'running');
        try {
            const { raw } = await this.callWithRetry(this.loadRole('BRAND_DIGEST.md'),
                `BRIEFING DO PROJETO:\n${briefingContent}\n\nExtraia DNA, tom e assets da marca. Responda APENAS com JSON válido.`,
                { expectJSON: true }
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

        const creatives = await Promise.all(['A', 'B', 'C'].map(async (variant) => {
            try {
                const { raw } = await this.callWithRetry(
                    `${creativeRole}\n\nVARIAÇÃO: Conceito ${variant}`,
                    `${creativeContext}\n\nGere um conceito criativo. Responda APENAS com JSON válido.`,
                    { expectJSON: true }
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
        this.emitProgress('CONCEPT_CRITIC', 'running');
        try {
            const creativeSummary = creatives.map(c => `Conceito ${c.variant}:\n${truncate(c.content, 500)}`).join('\n\n');
            const { raw } = await this.callWithRetry(this.loadRole('CONCEPT_CRITIC.md'),
                `BRIEFING:\n${truncate(briefingContent, 500)}\n\n${creativeSummary}\n\nAvalie e escolha o melhor conceito. Responda APENAS com JSON válido.`,
                { expectJSON: true }
            );
            this.saveFile(`${this.jobId}_03_CONCEPT_CRITIC.json`, raw);
            results.CONCEPT_CRITIC = raw;
            this.emitProgress('CONCEPT_CRITIC', 'completed');
        } catch (e) {
            this.saveFile(`${this.jobId}_03_CONCEPT_CRITIC.json`, createPlaceholder('CONCEPT_CRITIC', this.jobId, e.message));
            this.emitProgress('CONCEPT_CRITIC', 'failed', { error: e.message });
        }

        // ETAPA 4: EXECUTION DESIGN
        this.emitProgress('EXECUTION_DESIGN', 'running');
        try {
            const { raw } = await this.callWithRetry(this.loadRole('EXECUTION_DESIGN.md'),
                `BRIEFING:\n${truncate(briefingContent, 500)}\n\nCONCEITO VENCEDOR:\n${truncate(results.CONCEPT_CRITIC, 800)}\n\nDefina direção visual e técnica. Responda APENAS com JSON válido.`,
                { expectJSON: true }
            );
            this.saveFile(`${this.jobId}_04_EXECUTION_DESIGN.json`, raw);
            results.EXECUTION_DESIGN = raw;
            this.emitProgress('EXECUTION_DESIGN', 'completed');
        } catch (e) {
            this.saveFile(`${this.jobId}_04_EXECUTION_DESIGN.json`, createPlaceholder('EXECUTION_DESIGN', this.jobId, e.message));
            this.emitProgress('EXECUTION_DESIGN', 'failed', { error: e.message });
        }

        // ETAPA 5: PROPOSAL WRITER
        this.emitProgress('PROPOSAL_WRITER', 'running');
        try {
            const { raw } = await this.callWithRetry(this.loadRole('PROPOSAL_WRITER.md'),
                `BRIEFING:\n${truncate(briefingContent, 500)}\n\nCONCEITO:\n${truncate(results.CONCEPT_CRITIC, 500)}\n\nEXECUÇÃO:\n${truncate(results.EXECUTION_DESIGN, 500)}\n\nEscreva a proposta comercial completa. Responda em Markdown.`
            );
            this.saveFile(`${this.jobId}_05_PROPOSAL.md`, raw);
            results.PROPOSAL = raw;
            this.emitProgress('PROPOSAL_WRITER', 'completed');
        } catch (e) {
            this.saveFile(`${this.jobId}_05_PROPOSAL.md`, `# PROPOSAL - FAILED\n${e.message}`);
            this.emitProgress('PROPOSAL_WRITER', 'failed', { error: e.message });
        }

        // ETAPA 6: DIRECTOR
        this.emitProgress('DIRECTOR', 'running');
        try {
            const { raw } = await this.callWithRetry(this.loadRole('DIRECTOR.md'),
                `BRIEFING:\n${truncate(briefingContent, 500)}\n\nPROPOSTA:\n${truncate(results.PROPOSAL, 800)}\n\nEXECUÇÃO:\n${truncate(results.EXECUTION_DESIGN, 500)}\n\nAvalie a execução audiovisual. Responda APENAS com JSON válido.`,
                { expectJSON: true }
            );
            this.saveFile(`${this.jobId}_06_DIRECTOR.json`, raw);
            results.DIRECTOR = raw;
            this.emitProgress('DIRECTOR', 'completed');
        } catch (e) {
            this.saveFile(`${this.jobId}_06_DIRECTOR.json`, createPlaceholder('DIRECTOR', this.jobId, e.message));
            this.emitProgress('DIRECTOR', 'failed', { error: e.message });
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
        const stages = [
            { name: 'TRIAGE', role: 'TRIAGE_ORIGINAIS.md', prompt: 'Faça a triagem do projeto.', json: true },
            { name: 'ANGEL', role: 'ANGEL_ORIGINAIS.md', prompt: 'Defenda o projeto com argumentos fortes.', json: true },
            { name: 'DEMON', role: 'DEMON_ORIGINAIS.md', prompt: 'Ataque o projeto sem piedade.', json: true },
            { name: 'SALES_SHARK', role: 'SALES_SHARK_ORIGINAIS.md', prompt: 'Analise o potencial comercial.', json: true },
            { name: 'CREATIVE_DOCTOR', role: 'CREATIVE_DOCTOR_ORIGINAIS.md', prompt: 'Avalie e refine o conceito criativo.', json: true },
            { name: 'DOCTOR_FINAL', role: 'DOCTOR_FINAL_ORIGINAIS.md', prompt: 'Dê o parecer final do projeto.', json: true },
        ];

        let context = briefingContent;

        for (const stage of stages) {
            this.emitProgress(stage.name, 'running');
            try {
                const opts = stage.json ? { expectJSON: true } : {};
                const { raw } = await this.callWithRetry(this.loadRole(stage.role),
                    `PROJETO:\n${context}\n\n${stage.prompt} Responda APENAS com JSON válido.`,
                    opts
                );
                const ext = stage.json ? 'json' : 'md';
                this.saveFile(`${this.jobId}_${stage.name}.${ext}`, raw);
                this.saveLog(`${this.jobId}_${stage.name}.log`, raw);
                results[stage.name] = raw;
                context += `\n\n## ${stage.name}\n${truncate(raw, 800)}`;
                this.emitProgress(stage.name, 'completed');
            } catch (e) {
                this.saveFile(`${this.jobId}_${stage.name}.json`, createPlaceholder(stage.name, this.jobId, e.message));
                this.emitProgress(stage.name, 'failed', { error: e.message });
            }
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

        // Salvar briefing input
        this.saveFile(`${this.jobId}_BRIEFING_INPUT.md`, briefingContent);

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

            this.emitProgress('PIPELINE', 'completed', { mode: this.mode });
            console.log(`✅ Pipeline ${this.mode.toUpperCase()} concluído | Job: ${this.jobId}`);

            return { jobId: this.jobId, mode: this.mode, status: 'completed', stages: results };
        } catch (error) {
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
        model: model || 'openrouter/free',
        emitStateUpdate: emitStateUpdate || (() => {}),
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
