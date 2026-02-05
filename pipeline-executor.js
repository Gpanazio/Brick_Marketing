#!/usr/bin/env node
/**
 * BRICK AI PIPELINE EXECUTOR v1.0
 * 
 * Orquestra o pipeline de Marketing/Projetos com agentes especializados.
 * Cada etapa roda com o modelo correto via OpenClaw sessions_spawn.
 */

const fs = require('fs');
const path = require('path');

// CONFIG
const GATEWAY_URL = process.env.GATEWAY_URL || 'http://localhost:18789/api';
const GATEWAY_TOKEN = process.env.GATEWAY_TOKEN || '';
const HISTORY_ROOT = path.join(__dirname, 'history');
const BRIEFING_DIR = path.join(HISTORY_ROOT, 'marketing', 'briefing');  // Corrigido: usar history/
const WIP_DIR = path.join(HISTORY_ROOT, 'marketing', 'wip');
const DONE_DIR = path.join(HISTORY_ROOT, 'marketing', 'done');

// PIPELINE MARKETING (14 etapas + DOUGLAS pré-processamento)
const MARKETING_PIPELINE = [
    { id: '01', name: 'VALIDATOR', role: 'BRIEF_VALIDATOR', model: 'flash', timeout: 60 },
    { id: '02', name: 'AUDIENCE', role: 'AUDIENCE_ANALYST', model: 'flash', timeout: 90 },
    { id: '03', name: 'RESEARCH', role: 'TOPIC_RESEARCHER', model: 'flash', timeout: 120 },
    { id: '04', name: 'CLAIMS', role: 'CLAIMS_CHECKER', model: 'flash', timeout: 90 },
    { id: '05A', name: 'COPY_GPT', role: 'COPYWRITER', model: 'gpt', timeout: 180 },
    { id: '05B', name: 'COPY_FLASH', role: 'COPYWRITER', model: 'flash', timeout: 120 },
    { id: '05C', name: 'COPY_SONNET', role: 'COPYWRITER', model: 'sonnet', timeout: 180 },
    { id: '06', name: 'BRAND_GUARDIANS', role: 'BRAND_GUARDIAN', model: 'flash', timeout: 90 },
    { id: '07', name: 'CRITICS', role: 'CRITIC', model: 'opus', timeout: 120, isJudge: true, fallbackModels: ['gemini', 'gpt'] },
    { id: '07B', name: 'DIRECTOR', role: 'DIRECTOR', model: 'gpt', timeout: 180, conditional: true }, // SÓ se ajustes_sugeridos
    { id: '08', name: 'WALL', role: 'FILTRO_FINAL', model: 'opus', timeout: 120, isJudge: true, fallbackModels: ['gemini', 'gpt'] },
    { id: '09', name: 'HUMAN', role: null, model: null, timeout: 0 } // Aprovação manual
];

// Helpers
const log = (level, event, data = {}) => {
    console.log(JSON.stringify({ level, event, ...data, timestamp: new Date().toISOString() }));
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Ler arquivo JSON ou Markdown
function readFile(filepath) {
    try {
        const content = fs.readFileSync(filepath, 'utf-8');
        // Tentar parsear como JSON
        try {
            return JSON.parse(content);
        } catch {
            return content; // Retornar como string se não for JSON
        }
    } catch (e) {
        log('error', 'file_read_failed', { filepath, error: e.message });
        return null;
    }
}

// Salvar arquivo
function saveFile(filepath, content) {
    try {
        const data = typeof content === 'string' ? content : JSON.stringify(content, null, 2);
        fs.writeFileSync(filepath, data, 'utf-8');
        log('info', 'file_saved', { filepath });
        return true;
    } catch (e) {
        log('error', 'file_save_failed', { filepath, error: e.message });
        return false;
    }
}

// Chamar OpenClaw Gateway (sessions_spawn)
async function spawnAgent(role, model, task, jobId, timeout = 120) {
    try {
        log('info', 'agent_spawning', { role, model, jobId });
        
        const payload = {
            action: 'spawn',
            task,
            agentId: role.toLowerCase(),
            model,
            runTimeoutSeconds: timeout,
            cleanup: 'delete',
            label: `${jobId}_${role}`
        };

        const res = await fetch(`${GATEWAY_URL}/api/sessions`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${GATEWAY_TOKEN}`
            },
            body: JSON.stringify(payload)
        });

        if (!res.ok) {
            throw new Error(`Gateway error: ${res.status} ${res.statusText}`);
        }

        const result = await res.json();
        log('info', 'agent_completed', { role, jobId, result });
        return result;

    } catch (e) {
        log('error', 'agent_spawn_failed', { role, model, error: e.message });
        return null;
    }
}

// Spawn com fallback (juiz padrão: opus → gemini → gpt)
async function spawnWithFallback(role, models, task, jobId, timeout) {
    for (const model of models) {
        const result = await spawnAgent(role, model, task, jobId, timeout);
        if (result) return { result, model };
        log('warn', 'agent_fallback', { role, model, jobId });
    }
    return { result: null, model: null };
}

function getOutputExt(step) {
    if (!step || !step.role) return 'json';
    if (step.role === 'COPYWRITER' || step.role === 'DIRECTOR') return 'md';
    if (step.name && step.name.includes('COPY')) return 'md';
    return 'json';
}

function getLatestCopyMarkdown(jobId) {
    const directorPath = path.join(WIP_DIR, `${jobId}_07B_DIRECTOR.md`);
    if (fs.existsSync(directorPath)) return readFile(directorPath);

    const criticsPath = path.join(WIP_DIR, `${jobId}_07_CRITICS.json`);
    const criticsData = readFile(criticsPath);
    if (criticsData && criticsData.copy_vencedora) return criticsData.copy_vencedora;

    return null;
}

function getStepIndex(stepId) {
    return MARKETING_PIPELINE.findIndex(s => s.id === stepId);
}


// ETAPA 0: DOUGLAS PRÉ-PROCESSAMENTO (eu faço isso via prompt normal, não spawn)
async function douglasPreProcess(briefingPath, jobId) {
    log('info', 'douglas_preprocessing', { briefingPath, jobId });
    
    const briefingContent = readFile(briefingPath);
    if (!briefingContent) return null;

    // Criar briefing processado
    const processedPath = path.join(WIP_DIR, `${jobId}_PROCESSED.md`);
    
    // Por enquanto, só copiar. Futuramente, Douglas extrai PDFs/imagens aqui
    const processedContent = `# BRIEFING PROCESSADO: ${path.basename(briefingPath, '.md')}\n\n${briefingContent}`;
    
    saveFile(processedPath, processedContent);
    
    log('info', 'douglas_preprocessing_done', { processedPath });
    return processedContent;
}

// Executar pipeline completo
async function runPipeline(briefingPath, mode = 'marketing') {
    const jobId = Date.now().toString();
    const briefingName = path.basename(briefingPath, '.md');
    
    log('info', 'pipeline_start', { jobId, briefingName, mode });
    
    // ETAPA 0: Douglas pré-processamento
    const processedBriefing = await douglasPreProcess(briefingPath, jobId);
    if (!processedBriefing) {
        log('error', 'pipeline_failed', { step: 'DOUGLAS', jobId });
        return;
    }

    let context = processedBriefing;
    let attempts = 0;
    const MAX_ATTEMPTS = 3;
    let startIndex = 0;

    attemptLoop: while (attempts < MAX_ATTEMPTS) {
        attempts++;
        log('info', 'pipeline_attempt', { attempt: attempts, jobId, startIndex });

        // Executar cada etapa do pipeline (com retomada inteligente)
        for (let i = startIndex; i < MARKETING_PIPELINE.length; i++) {
            const step = MARKETING_PIPELINE[i];

            // Skip HUMAN (aprovação manual)
            if (step.name === 'HUMAN') {
                log('info', 'pipeline_awaiting_approval', { jobId });
                return; // Aguardar aprovação manual
            }

            // Skip DIRECTOR se não tiver ajustes_sugeridos
            if (step.conditional && step.name === 'DIRECTOR') {
                const criticsPath = path.join(WIP_DIR, `${jobId}_07_CRITICS.json`);
                const criticsData = readFile(criticsPath);

                if (!criticsData || !criticsData.ajustes_sugeridos || criticsData.ajustes_sugeridos.length === 0) {
                    log('info', 'director_skipped', { jobId, reason: 'no_adjustments' });
                    continue;
                }

                const winningModel = criticsData.modelo_vencedor || 'gpt';
                step.model = winningModel;
                log('info', 'director_executing', { jobId, model: winningModel });
            }

            // Construir task prompt (Wall precisa receber markdown)
            let taskContext = context;
            if (step.name === 'WALL') {
                const latestCopy = getLatestCopyMarkdown(jobId);
                if (!latestCopy) {
                    log('error', 'wall_missing_copy', { jobId });
                    break;
                }
                taskContext = latestCopy;
            }

            const outputExt = getOutputExt(step);
            const outputPath = path.join(WIP_DIR, `${jobId}_${step.id}_${step.name}.${outputExt}`);

            const taskPrompt = `
Você é o agente ${step.role} do pipeline Brick AI.

**Job ID:** ${jobId}
**Etapa:** ${step.id} - ${step.name}

**Contexto do briefing:**
${taskContext}

**Sua missão:**
1. Ler o arquivo de role em ~/projects/Brick_Marketing/roles/${step.role}.md
2. Seguir as instruções da role RIGOROSAMENTE
3. Gerar output no formato especificado (JSON ou Markdown)
4. Salvar o resultado em ~/projects/Brick_Marketing/history/marketing/wip/${jobId}_${step.id}_${step.name}.${outputExt}

**IMPORTANTE:**
- Não invente informações
- Siga a rubrica de avaliação da role
- Output deve ser auto-contido (próximo agente só lerá seu arquivo)
`.trim();

            let spawnResult = null;
            if (step.isJudge) {
                const models = [step.model, ...(step.fallbackModels || [])];
                const { result, model } = await spawnWithFallback(step.role, models, taskPrompt, jobId, step.timeout);
                spawnResult = result;
                if (model) log('info', 'judge_model_used', { jobId, step: step.name, model });
            } else {
                spawnResult = await spawnAgent(step.role, step.model, taskPrompt, jobId, step.timeout);
            }

            if (!spawnResult) {
                log('error', 'pipeline_step_failed', { step: step.name, jobId, attempt: attempts });
                break; // Falhou, tentar novamente
            }

            // Atualizar contexto com output da etapa
            const outputData = readFile(outputPath);
            if (outputData) {
                context = typeof outputData === 'string' ? outputData : JSON.stringify(outputData, null, 2);
            }

            // Brand Guardian lock (auto-cicatrizável)
            if (step.name === 'BRAND_GUARDIANS' && outputData && outputData.status === 'BRAND_FAIL') {
                log('warn', 'brand_guardian_failed', { jobId, attempt: attempts });
                startIndex = getStepIndex('05A');
                context = `${processedBriefing}\n\n---\n\n**FEEDBACK BRAND GUARDIAN:**\n${JSON.stringify(outputData, null, 2)}`;
                continue attemptLoop;
            }

            // Se chegou no WALL, verificar score
            if (step.name === 'WALL') {
                const wallData = outputData;

                if (wallData && wallData.score_final >= 80) {
                    log('info', 'pipeline_wall_approved', { jobId, score: wallData.score_final });
                    const finalPath = path.join(WIP_DIR, `${jobId}_FINAL.md`);
                    const directorPath = path.join(WIP_DIR, `${jobId}_07B_DIRECTOR.md`);
                    const finalContent = fs.existsSync(directorPath)
                        ? readFile(directorPath)
                        : readFile(path.join(WIP_DIR, `${jobId}_07_CRITICS.json`))?.copy_vencedora || 'Erro ao gerar FINAL';

                    saveFile(finalPath, finalContent);
                    return; // Sucesso! Aguardar aprovação HUMAN
                }

                log('warn', 'pipeline_wall_rejected', { jobId, score: wallData?.score_final || 0, attempt: attempts });

                // Score < 80 → loop inteligente (Copywriter ou Director)
                const recommend = wallData?.recomendar_retorno || 'COPYWRITER';
                startIndex = recommend === 'DIRECTOR' ? getStepIndex('07B') : getStepIndex('05A');

                context = `${processedBriefing}\n\n---\n\n**FEEDBACK DO WALL (Tentativa ${attempts}):**\n${JSON.stringify(wallData, null, 2)}`;
                continue attemptLoop;
            }
        }

        // Se completou todas as etapas sem falhas, sair do loop
        break;
    }

    if (attempts >= MAX_ATTEMPTS) {
        log('error', 'pipeline_max_attempts_reached', { jobId });
        // Escalar pra humano
        const errorPath = path.join(WIP_DIR, `${jobId}_ERROR.txt`);
        saveFile(errorPath, `Pipeline falhou após ${MAX_ATTEMPTS} tentativas.\n\nÚltimo contexto:\n${context}`);
    }
}

// Monitorar pasta briefing/
function watchBriefings() {
    fs.watch(BRIEFING_DIR, { recursive: false }, (eventType, filename) => {
        if (filename && filename.endsWith('.md')) {
            const briefingPath = path.join(BRIEFING_DIR, filename);
            
            // Verificar se arquivo existe (evitar eventos duplicados)
            if (fs.existsSync(briefingPath)) {
                log('info', 'briefing_detected', { filename });
                
                // Aguardar 1 segundo pra garantir que arquivo foi completamente escrito
                setTimeout(() => {
                    runPipeline(briefingPath, 'marketing');
                }, 1000);
            }
        }
    });
}

// Garantir que pastas existem
[BRIEFING_DIR, WIP_DIR, DONE_DIR].forEach(dir => {
    if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
    }
});

console.log('🤖 Brick AI Pipeline Executor v1.0');
console.log(`📁 Briefing: ${BRIEFING_DIR}`);
console.log(`📁 WIP: ${WIP_DIR}`);
console.log(`🌐 Gateway: ${GATEWAY_URL}`);
console.log('---');
console.log('👀 Monitorando briefings...\n');

watchBriefings();
