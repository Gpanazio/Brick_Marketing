// Marketing Pipeline Runner - Autonomous Version
// Executa o pipeline completo usando OpenRouter API

const fs = require('fs');
const path = require('path');
const { getClient, FREE_MODELS, PAID_MODELS } = require('./openrouter-client');

// Configuração do pipeline - nomes corretos dos roles
const PIPELINE_CONFIG = {
    stages: [
        { name: 'INTAKE', model: 'openrouter/free', roleFile: 'roles/INTAKE.md' },
        { name: 'VALIDATOR', model: 'openrouter/free', roleFile: 'roles/BRIEF_VALIDATOR.md' },
        { name: 'AUDIENCE', model: 'openrouter/free', roleFile: 'roles/AUDIENCE_ANALYST.md' },
        { name: 'RESEARCH', model: 'openrouter/free', roleFile: 'roles/RESEARCHER.md' },
        { name: 'CLAIMS', model: 'openrouter/free', roleFile: 'roles/CLAIMS_CHECKER.md' },
        { name: 'COPYWRITER', model: 'openrouter/free', roleFile: 'roles/COPYWRITER.md' },
        { name: 'COPY_SENIOR', model: 'openrouter/free', roleFile: 'roles/COPY_SENIOR.md' },
        { name: 'WALL', model: 'openrouter/free', roleFile: 'roles/WALL.md' },
    ]
};

class PipelineRunner {
    constructor(options = {}) {
        this.mode = options.mode || 'free'; // 'free' ou 'paid'
        this.client = getClient(this.mode);
        this.briefingId = options.briefingId || Date.now().toString();
        this.outputDir = options.outputDir || './marketing/wip';
        this.io = options.io || null; // Socket.IO instance
        this.onProgress = options.onProgress || (() => {});
    }

    // Emitir progresso via Socket.IO
    emitProgress(stage, status, data = {}) {
        const payload = {
            briefingId: this.briefingId,
            stage,
            status,
            timestamp: new Date().toISOString(),
            ...data
        };
        
        // Callback local
        this.onProgress(payload);
        
        // Emitir via Socket.IO se disponível
        if (this.io) {
            this.io.emit('pipeline:progress', payload);
        }
    }

    // Carregar role de arquivo
    loadRole(roleFile) {
        const rolePath = path.join(__dirname, '..', roleFile);
        if (fs.existsSync(rolePath)) {
            return fs.readFileSync(rolePath, 'utf-8');
        }
        // Fallback: procurar em outras pastas
        const altPaths = [
            path.join(__dirname, '..', 'roles', path.basename(roleFile)),
            path.join(__dirname, '..', 'history', 'marketing', 'roles', path.basename(roleFile))
        ];
        for (const altPath of altPaths) {
            if (fs.existsSync(altPath)) {
                return fs.readFileSync(altPath, 'utf-8');
            }
        }
        return 'Você é um assistente de marketing.';
    }

    // Executar uma etapa
    async runStage(stage, input) {
        const role = this.loadRole(stage.roleFile);
        const prompt = `Briefing:\n${input}\n\n---\n\nResponda em JSON com o formato requerido pelo sistema.`;

        console.log(`[${stage.name}] Executando com ${stage.model}...`);
        
        const startTime = Date.now();
        const output = await this.client.callAgent(role, prompt, stage.model);
        const duration = Date.now() - startTime;

        console.log(`[${stage.name}] Concluído em ${duration}ms`);

        return output;
    }

    // Executar pipeline completo
    async run(briefing) {
        const results = {
            briefingId: this.briefingId,
            startedAt: new Date().toISOString(),
            stages: {},
            status: 'running'
        };

        let currentOutput = briefing;

        try {
            for (const stage of PIPELINE_CONFIG.stages) {
                this.emitProgress(stage.name, 'running', { 
                    progress: (PIPELINE_CONFIG.stages.indexOf(stage) / PIPELINE_CONFIG.stages.length) * 100 
                });

                const output = await this.runStage(stage, currentOutput);
                results.stages[stage.name] = {
                    output,
                    model: stage.model,
                    duration: Date.now()
                };

                // Emitir conclusão da etapa
                this.emitProgress(stage.name, 'completed', { output: output.substring(0, 200) });

                currentOutput = output;
            }

            results.status = 'completed';
            results.completedAt = new Date().toISOString();

        } catch (error) {
            results.status = 'failed';
            results.error = error.message;
            this.emitProgress('ERROR', 'failed', { error: error.message });
        }

        // Salvar resultado
        const outputPath = path.join(this.outputDir, `${this.briefingId}_final.json`);
        fs.writeFileSync(outputPath, JSON.stringify(results, null, 2));

        this.onProgress({ stage: 'DONE', status: results.status, progress: 100 });

        return results;
    }
}

// Endpoint handler para server.js
async function handlePipelineRun(req, res) {
    const { briefing, mode = 'free' } = req.body;

    if (!briefing) {
        return res.status(400).json({ error: 'Briefing é obrigatório' });
    }

    const runner = new PipelineRunner({
        mode,
        briefingId: Date.now().toString(),
        onProgress: (progress) => {
            // Emitir via socket se disponível
            if (req.app.get('io')) {
                req.app.get('io').emit('pipelineProgress', progress);
            }
        }
    });

    try {
        const result = await runner.run(briefing);
        res.json(result);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}

module.exports = {
    PipelineRunner,
    handlePipelineRun,
    PIPELINE_CONFIG
};
