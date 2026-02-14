// Pipeline Runner Autônomo - Brick AI War Room
// Executa pipelines completos no Railway usando OpenRouter API
// Substitui: runner.js (local) + run-marketing.sh + run-ideias.sh + run-projetos.sh

const fs = require('fs');
const path = require('path');
const { OpenRouterClient } = require('./openrouter-client');

// ============================================================================
// CONFIGURAÇÃO DE PIPELINES
// ============================================================================

const PIPELINES = {
    marketing: {
        stages: [
            { name: 'VALIDATOR', file: '01_VALIDATOR', ext: 'json', role: 'BRIEF_VALIDATOR.md', inject: [] },
            { name: 'AUDIENCE', file: '02_AUDIENCE', ext: 'json', role: 'AUDIENCE_ANALYST.md', inject: ['BRAND_GUIDE.md'] },
            { name: 'RESEARCH', file: '03_RESEARCH', ext: 'json', role: 'TOPIC_RESEARCHER.md', inject: [] },
            { name: 'CLAIMS', file: '04_CLAIMS', ext: 'json', role: 'CLAIMS_CHECKER.md', inject: [] },
            { name: 'COPY_GPT', file: '05A_COPY_GPT', ext: 'md', role: 'COPYWRITER.md', inject: ['BRAND_GUIDE.md'], variant: 'A' },
            { name: 'COPY_FLASH', file: '05B_COPY_FLASH', ext: 'md', role: 'COPYWRITER.md', inject: ['BRAND_GUIDE.md'], variant: 'B' },
            { name: 'COPY_SONNET', file: '05C_COPY_SONNET', ext: 'md', role: 'COPYWRITER.md', inject: ['BRAND_GUIDE.md'], variant: 'C' },
            { name: 'COPY_SENIOR', file: '06_COPY_SENIOR', ext: 'json', role: 'COPY_SENIOR.md', inject: ['BRAND_GUARDIAN.md'] },
            { name: 'WALL', file: '07_WALL', ext: 'json', role: 'FILTRO_FINAL.md', inject: ['BRAND_GUARDIAN.md'] },
        ]
    },
    ideias: {
        stages: [
            { name: 'PAIN_CHECK', file: 'PAIN_CHECK', ext: 'json', role: 'PAIN_CHECK.md', inject: [] },
            { name: 'MARKET_SCAN', file: 'MARKET_SCAN', ext: 'md', role: 'MARKET_SCAN.md', inject: [] },
            { name: 'ANGEL_GEN', file: 'ANGEL_GEN', ext: 'json', role: 'ANGEL_GEN.md', inject: [], parallel: 'DEVIL_GEN' },
            { name: 'DEVIL_GEN', file: 'DEVIL_GEN', ext: 'json', role: 'DEVIL_GEN.md', inject: [], parallel: 'ANGEL_GEN' },
            { name: 'VIABILITY', file: 'VIABILITY', ext: 'json', role: 'VIABILITY.md', inject: [] },
        ]
    },
    projetos: {
        stages: [
            { name: 'BRAND_DIGEST', file: '01_BRAND_DIGEST', ext: 'json', role: 'BRAND_DIGEST.md', inject: [] },
            { name: 'CREATIVE_A', file: '02A_CREATIVE', ext: 'json', role: 'CREATIVE_IDEATION.md', inject: [], variant: 'A' },
            { name: 'CREATIVE_B', file: '02B_CREATIVE', ext: 'json', role: 'CREATIVE_IDEATION.md', inject: [], variant: 'B' },
            { name: 'CREATIVE_C', file: '02C_CREATIVE', ext: 'json', role: 'CREATIVE_IDEATION.md', inject: [], variant: 'C' },
            { name: 'CONCEPT_CRITIC', file: '03_CONCEPT_CRITIC', ext: 'json', role: 'CONCEPT_CRITIC.md', inject: [] },
            { name: 'EXECUTION_DESIGN', file: '04_EXECUTION_DESIGN', ext: 'json', role: 'EXECUTION_DESIGN.md', inject: [] },
            { name: 'PROPOSAL_WRITER', file: '05_PROPOSAL', ext: 'md', role: 'PROPOSAL_WRITER.md', inject: [] },
            { name: 'DIRECTOR', file: '06_DIRECTOR', ext: 'json', role: 'DIRECTOR.md', inject: [] },
        ]
    },
    originais: {
        stages: [
            { name: 'TRIAGE', file: 'TRIAGE', ext: 'json', role: 'TRIAGE_ORIGINAIS.md', inject: [] },
            { name: 'ANGEL', file: 'ANGEL', ext: 'json', role: 'ANGEL_ORIGINAIS.md', inject: [] },
            { name: 'DEMON', file: 'DEMON', ext: 'json', role: 'DEMON_ORIGINAIS.md', inject: [] },
            { name: 'SALES_SHARK', file: 'SALES_SHARK', ext: 'json', role: 'SALES_SHARK_ORIGINAIS.md', inject: [] },
            { name: 'CREATIVE_DOCTOR', file: 'CREATIVE_DOCTOR', ext: 'json', role: 'CREATIVE_DOCTOR_ORIGINAIS.md', inject: [] },
            { name: 'DOCTOR_FINAL', file: 'DOCTOR_FINAL', ext: 'json', role: 'DOCTOR_FINAL_ORIGINAIS.md', inject: [] },
        ]
    }
};

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
        this.wipDir = options.wipDir || path.join(__dirname, '..', 'history', this.mode, 'wip');
        this.logsDir = path.join(this.wipDir, 'logs');
        this.model = options.model || 'openrouter/free';
        this.emitStateUpdate = options.emitStateUpdate || (() => {});

        // Garantir diretórios
        if (!fs.existsSync(this.wipDir)) fs.mkdirSync(this.wipDir, { recursive: true });
        if (!fs.existsSync(this.logsDir)) fs.mkdirSync(this.logsDir, { recursive: true });
    }

    // Carregar role file
    loadRole(roleFilename) {
        const rolePath = path.join(this.rolesDir, roleFilename);
        if (fs.existsSync(rolePath)) {
            return fs.readFileSync(rolePath, 'utf-8');
        }
        console.warn(`[RUNNER] Role não encontrado: ${rolePath}`);
        return '';
    }

    // Emitir progresso para frontend via Socket.IO
    emitProgress(stage, status, data = {}) {
        const payload = {
            jobId: this.jobId,
            mode: this.mode,
            stage,
            status, // 'running' | 'completed' | 'failed'
            timestamp: new Date().toISOString(),
            ...data
        };

        console.log(`[PIPELINE] ${stage}: ${status}`, data.error || '');

        if (this.io) {
            this.io.emit('pipeline:progress', payload);
        }
    }

    // Salvar resultado como arquivo (mesmo formato dos shell scripts)
    saveResult(stage, content) {
        const filename = `${this.jobId}_${stage.file}.${stage.ext}`;
        const filePath = path.join(this.wipDir, filename);
        fs.writeFileSync(filePath, content);

        // Salvar log
        const logFilename = `${this.jobId}_${stage.file}.log`;
        const logPath = path.join(this.logsDir, logFilename);
        fs.writeFileSync(logPath, `[${new Date().toISOString()}] ${stage.name}\nModel: ${this.model}\n\n${content}`);

        return filename;
    }

    // Executar uma etapa
    async runStage(stage, context) {
        const startTime = Date.now();
        this.emitProgress(stage.name, 'running');

        try {
            // Montar system prompt com role + injeções
            let systemPrompt = this.loadRole(stage.role);

            // Injetar contextos adicionais (BRAND_GUIDE, BRAND_GUARDIAN, etc.)
            for (const injectFile of (stage.inject || [])) {
                const injected = this.loadRole(injectFile);
                if (injected) {
                    systemPrompt += `\n\n---\n## ${injectFile.replace('.md', '')}\n${injected}`;
                }
            }

            // Montar prompt do usuário
            let userPrompt = `## Contexto acumulado do pipeline\n${context}\n\n---\n`;
            userPrompt += `Analise o conteúdo acima conforme seu role. `;

            if (stage.ext === 'json') {
                userPrompt += `Responda APENAS com JSON válido (sem markdown, sem \`\`\`json).`;
            } else {
                userPrompt += `Responda em Markdown estruturado.`;
            }

            if (stage.variant) {
                userPrompt += ` Você é a variante ${stage.variant}.`;
            }

            // Chamar OpenRouter
            const response = await this.client.callAgent(systemPrompt, userPrompt, this.model);

            // Salvar resultado
            const filename = this.saveResult(stage, response);

            const duration = Date.now() - startTime;
            this.emitProgress(stage.name, 'completed', {
                duration,
                filename,
                outputPreview: response.substring(0, 150)
            });

            // Atualizar estado do frontend (nodes)
            this.emitStateUpdate(this.mode);

            return response;

        } catch (error) {
            const duration = Date.now() - startTime;
            this.emitProgress(stage.name, 'failed', { duration, error: error.message });

            // Salvar log de erro
            const logFilename = `${this.jobId}_${stage.file}_ERROR.log`;
            const logPath = path.join(this.logsDir, logFilename);
            fs.writeFileSync(logPath, `[${new Date().toISOString()}] ERRO: ${error.message}\n${error.stack}`);

            throw error;
        }
    }

    // Executar pipeline completo
    async run(briefingContent) {
        const pipeline = PIPELINES[this.mode];
        if (!pipeline) {
            throw new Error(`Pipeline não encontrado para modo: ${this.mode}`);
        }

        console.log(`[PIPELINE] Iniciando ${this.mode} | Job: ${this.jobId} | Model: ${this.model}`);
        this.emitProgress('PIPELINE', 'started', { 
            totalStages: pipeline.stages.length,
            model: this.model 
        });

        // Salvar briefing input
        const briefingFilename = `${this.jobId}_BRIEFING_INPUT.md`;
        const briefingPath = path.join(this.wipDir, briefingFilename);
        fs.writeFileSync(briefingPath, briefingContent);
        this.emitStateUpdate(this.mode);

        let context = briefingContent;
        const results = {
            jobId: this.jobId,
            mode: this.mode,
            model: this.model,
            startedAt: new Date().toISOString(),
            stages: {},
            status: 'running'
        };

        try {
            // Identificar etapas paralelas
            const parallelGroups = {};
            const processedParallel = new Set();

            for (const stage of pipeline.stages) {
                if (processedParallel.has(stage.name)) continue;

                if (stage.parallel) {
                    // Agrupar etapas paralelas
                    const partner = pipeline.stages.find(s => s.name === stage.parallel);
                    if (partner && !processedParallel.has(partner.name)) {
                        // Executar em paralelo
                        this.emitProgress(stage.name, 'running');
                        this.emitProgress(partner.name, 'running');

                        const [resultA, resultB] = await Promise.all([
                            this.runStage(stage, context),
                            this.runStage(partner, context)
                        ]);

                        results.stages[stage.name] = resultA;
                        results.stages[partner.name] = resultB;
                        context += `\n\n## ${stage.name}\n${resultA}\n\n## ${partner.name}\n${resultB}`;

                        processedParallel.add(stage.name);
                        processedParallel.add(partner.name);
                        continue;
                    }
                }

                // Executar sequencialmente
                const output = await this.runStage(stage, context);
                results.stages[stage.name] = output;
                context += `\n\n## ${stage.name}\n${output}`;
            }

            // Gerar FINAL.md
            const finalContent = this.generateFinal(results);
            const finalPath = path.join(this.wipDir, `${this.jobId}_FINAL.md`);
            fs.writeFileSync(finalPath, finalContent);
            this.emitStateUpdate(this.mode);

            results.status = 'completed';
            results.completedAt = new Date().toISOString();

            this.emitProgress('PIPELINE', 'completed', {
                totalDuration: Date.now() - new Date(results.startedAt).getTime(),
                stagesCompleted: Object.keys(results.stages).length
            });

        } catch (error) {
            results.status = 'failed';
            results.error = error.message;
            this.emitProgress('PIPELINE', 'failed', { error: error.message });
        }

        return results;
    }

    // Gerar arquivo FINAL.md consolidado
    generateFinal(results) {
        let final = `# Pipeline ${this.mode.toUpperCase()} - Resultado Final\n`;
        final += `**Job ID:** ${this.jobId}\n`;
        final += `**Modelo:** ${this.model}\n`;
        final += `**Status:** ${results.status}\n`;
        final += `**Início:** ${results.startedAt}\n`;
        final += `**Fim:** ${new Date().toISOString()}\n\n`;
        final += `---\n\n`;

        for (const [stageName, output] of Object.entries(results.stages)) {
            final += `## ${stageName}\n\n${typeof output === 'string' ? output : JSON.stringify(output, null, 2)}\n\n---\n\n`;
        }

        return final;
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
        emitStateUpdate: emitStateUpdate || (() => {})
    });

    return await runner.run(briefing);
}

module.exports = {
    PipelineRunner,
    handlePipelineRun,
    PIPELINES
};
