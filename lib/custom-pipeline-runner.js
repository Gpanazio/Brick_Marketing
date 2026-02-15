// Custom Pipeline Runner - Brick AI War Room
// Executa workflows customizados definidos via Workflow Builder
// Interpreta JSON de workflow e executa dinamicamente

const fs = require('fs');
const path = require('path');
const { OpenRouterClient } = require('./openrouter-client');
const { GoogleAIClient } = require('./google-ai-client');

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
// TOPOLOGICAL SORT — resolve ordem de execução respeitando dependências
// ============================================================================

function topologicalSort(nodes, connections) {
    const graph = new Map();
    const inDegree = new Map();

    // Inicializar
    nodes.forEach(n => {
        graph.set(n.id, []);
        inDegree.set(n.id, 0);
    });

    // Construir grafo
    connections.forEach(conn => {
        const targets = Array.isArray(conn.to) ? conn.to : [conn.to];
        targets.forEach(target => {
            graph.get(conn.from)?.push(target);
            inDegree.set(target, (inDegree.get(target) || 0) + 1);
        });
    });

    // BFS — Kahn's algorithm
    const queue = [];
    const result = [];

    inDegree.forEach((degree, nodeId) => {
        if (degree === 0) queue.push(nodeId);
    });

    while (queue.length > 0) {
        // Coletar todos os nós com inDegree 0 (podem rodar em paralelo)
        const level = [...queue];
        queue.length = 0;
        result.push(level);

        level.forEach(nodeId => {
            const neighbors = graph.get(nodeId) || [];
            neighbors.forEach(neighbor => {
                inDegree.set(neighbor, inDegree.get(neighbor) - 1);
                if (inDegree.get(neighbor) === 0) {
                    queue.push(neighbor);
                }
            });
        });
    }

    return result; // Array de arrays — cada sub-array pode rodar em paralelo
}

// ============================================================================
// CUSTOM PIPELINE RUNNER
// ============================================================================

class CustomPipelineRunner {
    constructor(options = {}) {
        this.openrouterClient = new OpenRouterClient();
        this.googleClient = new GoogleAIClient();
        this.jobId = options.jobId;
        this.io = options.io || null;
        this.rolesDir = options.rolesDir || path.join(__dirname, '..', 'roles');
        this.historyRoot = options.historyRoot || path.join(__dirname, '..', 'history');
        this.wipDir = path.join(this.historyRoot, 'custom', 'wip');
        this.logsDir = path.join(this.wipDir, 'logs');
        this.emitStateUpdate = options.emitStateUpdate || (() => { });
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
        console.warn(`[CUSTOM-RUNNER] Role não encontrado: ${rolePath}`);
        return '';
    }

    // Emitir progresso para frontend
    emitProgress(stage, status, data = {}) {
        const payload = {
            jobId: this.jobId,
            mode: 'custom',
            stage,
            status,
            timestamp: new Date().toISOString(),
            ...data
        };
        console.log(`[CUSTOM-PIPELINE] ${stage}: ${status}${data.error ? ' - ' + data.error : ''}`);
        if (this.io) {
            this.io.emit('pipeline:progress', payload);
        }
    }

    // Salvar arquivo de resultado
    saveFile(filename, content) {
        const filePath = path.join(this.wipDir, filename);
        fs.writeFileSync(filePath, content);
        this.emitStateUpdate('custom');
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

    // Chamar agente com retry + fallback
    async callWithRetry(systemPrompt, userPrompt, options = {}) {
        const { maxRetries = this.maxRetries, expectJSON = false, model = {} } = options;

        const primaryProvider = model.primary?.provider || 'openrouter';
        const primaryModel = model.primary?.model || 'google/gemini-3-flash-preview';
        const fallback = model.fallback || null;

        let lastError;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            const useFallback = (attempt === maxRetries && fallback);
            const provider = useFallback ? fallback.provider : primaryProvider;
            const modelId = useFallback ? fallback.model : primaryModel;
            const client = this._getClient(provider);

            try {
                console.log(`  >> Tentativa ${attempt}/${maxRetries} [${provider}/${modelId}]${useFallback ? ' (FALLBACK)' : ''}`);
                const result = await client.callAgent(systemPrompt, userPrompt, modelId);
                // Both clients now return { content, usage }
                const response = result.content || result;

                if (expectJSON) {
                    const parsed = tryParseJSON(response);
                    if (parsed) {
                        const cleanJSON = JSON.stringify(parsed, null, 2);
                        return { raw: cleanJSON, parsed };
                    }
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
    // EXECUTAR WORKFLOW CUSTOMIZADO
    // ========================================================================
    async runWorkflow(workflow, briefingContent) {
        const { nodes, connections, loops } = workflow;
        const results = {};
        const nodeMap = new Map();

        // Indexar nós por ID
        nodes.forEach(n => nodeMap.set(n.id, n));

        // Resolver ordem de execução
        const executionLevels = topologicalSort(nodes, connections || []);

        console.log(`\n========================================`);
        console.log(`[CUSTOM-PIPELINE] Workflow: ${workflow.name}`);
        console.log(`[CUSTOM-PIPELINE] Nós: ${nodes.length} | Conexões: ${(connections || []).length}`);
        console.log(`[CUSTOM-PIPELINE] Levels: ${executionLevels.length}`);
        console.log(`========================================\n`);

        this.emitProgress('WORKFLOW_START', 'running', {
            workflowName: workflow.name,
            totalNodes: nodes.length
        });

        // Executar level por level
        for (let levelIdx = 0; levelIdx < executionLevels.length; levelIdx++) {
            const level = executionLevels[levelIdx];
            console.log(`\n--- Level ${levelIdx + 1}: [${level.join(', ')}] ---`);

            // Executar nós do mesmo level em paralelo
            const promises = level.map(async (nodeId) => {
                const node = nodeMap.get(nodeId);
                if (!node) return;

                const stepNum = String(levelIdx + 1).padStart(2, '0');
                const stageName = node.role || node.id;

                // Carregar role
                const roleContent = node.roleFile ? this.loadRole(node.roleFile) : '';
                const systemPrompt = node.config?.promptOverride || roleContent;

                // Construir contexto com outputs anteriores
                let contextParts = [`BRIEFING:\n${briefingContent}`];

                // Adicionar outputs de nós predecessores
                const predecessors = (connections || [])
                    .filter(c => {
                        const targets = Array.isArray(c.to) ? c.to : [c.to];
                        return targets.includes(nodeId);
                    })
                    .map(c => c.from);

                predecessors.forEach(predId => {
                    if (results[predId]) {
                        const predNode = nodeMap.get(predId);
                        const predName = predNode?.role || predId;
                        contextParts.push(`\n${predName}:\n${truncate(results[predId], 1000)}`);
                    }
                });

                // Adicionar injeções de contexto customizadas
                if (node.config?.contextInjections) {
                    node.config.contextInjections.forEach(injection => {
                        const injectionContent = this.loadRole(injection.file);
                        if (injectionContent) {
                            contextParts.push(`\n# ${injection.label || injection.file}\n${injectionContent}`);
                        }
                    });
                }

                const userPrompt = contextParts.join('\n\n---\n\n') +
                    '\n\nResponda conforme seu role.' +
                    (node.config?.expectJSON ? ' Responda APENAS com JSON válido.' : '');

                // Executar
                this.emitProgress(stageName, 'running', {
                    model: node.model?.primary?.model || 'default',
                    nodeId: node.id
                });

                try {
                    const { raw } = await this.callWithRetry(systemPrompt, userPrompt, {
                        expectJSON: node.config?.expectJSON || false,
                        model: node.model || {}
                    });

                    const ext = node.config?.expectJSON ? 'json' : 'md';
                    const filename = `${this.jobId}_${stepNum}_${stageName}.${ext}`;
                    this.saveFile(filename, raw);
                    this.saveLog(`${this.jobId}_${stepNum}_${stageName}.log`, raw);
                    results[nodeId] = raw;
                    this.emitProgress(stageName, 'completed', { nodeId: node.id });

                } catch (e) {
                    const ext = node.config?.expectJSON ? 'json' : 'md';
                    const filename = `${this.jobId}_${stepNum}_${stageName}.${ext}`;
                    this.saveFile(filename, createPlaceholder(stageName, this.jobId, e.message));
                    results[nodeId] = 'FAILED';
                    this.emitProgress(stageName, 'failed', { error: e.message, nodeId: node.id });
                }
            });

            await Promise.all(promises);
        }

        // ================================================================
        // LOOPS — processar condições de loop (ex: Wall < 80 → Copy Senior)
        // ================================================================
        if (loops && loops.length > 0) {
            for (const loop of loops) {
                let iteration = 0;
                const maxIter = loop.maxIterations || 3;

                while (iteration < maxIter) {
                    // Avaliar condição
                    const fromResult = results[loop.from];
                    if (!fromResult || fromResult === 'FAILED') break;

                    const parsed = tryParseJSON(fromResult);
                    if (!parsed) break;

                    // Avaliar condição dinâmica (ex: "score_final < 80")
                    const shouldLoop = this._evaluateCondition(loop.condition, parsed);
                    if (!shouldLoop) {
                        console.log(`✅ Loop ${loop.from} → ${loop.to}: condição satisfeita, saindo.`);
                        break;
                    }

                    iteration++;
                    console.log(`🔄 Loop ${iteration}/${maxIter}: ${loop.from} → ${loop.to}`);

                    // Re-executar nó "to"
                    const targetNode = nodeMap.get(loop.to);
                    if (!targetNode) break;

                    const stageName = targetNode.role || targetNode.id;
                    const roleContent = targetNode.roleFile ? this.loadRole(targetNode.roleFile) : '';
                    const systemPrompt = targetNode.config?.promptOverride || roleContent;

                    this.emitProgress(`${stageName}_LOOP_${iteration}`, 'running');

                    try {
                        const { raw } = await this.callWithRetry(systemPrompt,
                            `CONTEXTO DO LOOP:\n- Iteração ${iteration} de ${maxIter}\n- Feedback anterior:\n${fromResult}\n\nBRIEFING:\n${briefingContent}\n\nAplique ajustes. Responda conforme seu role.` +
                            (targetNode.config?.expectJSON ? ' Responda APENAS com JSON válido.' : ''),
                            {
                                expectJSON: targetNode.config?.expectJSON || false,
                                model: targetNode.model || {}
                            }
                        );

                        const ext = targetNode.config?.expectJSON ? 'json' : 'md';
                        const filename = `${this.jobId}_LOOP${iteration}_${stageName}.${ext}`;
                        this.saveFile(filename, raw);
                        results[loop.to] = raw;
                        this.emitProgress(`${stageName}_LOOP_${iteration}`, 'completed');
                    } catch (e) {
                        this.emitProgress(`${stageName}_LOOP_${iteration}`, 'failed', { error: e.message });
                        break;
                    }

                    // Re-executar nó "from" para reavaliar
                    const fromNode = nodeMap.get(loop.from);
                    if (!fromNode) break;

                    const fromStageName = fromNode.role || fromNode.id;
                    const fromRoleContent = fromNode.roleFile ? this.loadRole(fromNode.roleFile) : '';
                    const fromSystemPrompt = fromNode.config?.promptOverride || fromRoleContent;

                    this.emitProgress(`${fromStageName}_LOOP_${iteration}`, 'running');

                    try {
                        const { raw } = await this.callWithRetry(fromSystemPrompt,
                            `REAVALIAÇÃO (iteração ${iteration}):\n${results[loop.to]}\n\nAvalie novamente.` +
                            (fromNode.config?.expectJSON ? ' Responda APENAS com JSON válido.' : ''),
                            {
                                expectJSON: fromNode.config?.expectJSON || false,
                                model: fromNode.model || {}
                            }
                        );

                        const ext = fromNode.config?.expectJSON ? 'json' : 'md';
                        const filename = `${this.jobId}_LOOP${iteration}_${fromStageName}.${ext}`;
                        this.saveFile(filename, raw);
                        results[loop.from] = raw;
                        this.emitProgress(`${fromStageName}_LOOP_${iteration}`, 'completed');
                    } catch (e) {
                        this.emitProgress(`${fromStageName}_LOOP_${iteration}`, 'failed', { error: e.message });
                        break;
                    }
                }
            }
        }

        // FINAL: Consolidar resultados
        let finalContent = `# Workflow: ${workflow.name} — Resultado Final\n\n`;
        finalContent += `**Job ID:** ${this.jobId}\n`;
        finalContent += `**Workflow ID:** ${workflow.id}\n`;
        finalContent += `**Timestamp:** ${new Date().toISOString()}\n\n---\n\n`;

        for (const [nodeId, output] of Object.entries(results)) {
            const node = nodeMap.get(nodeId);
            const label = node?.role || nodeId;
            finalContent += `## ${label}\n\n${output}\n\n---\n\n`;
        }

        this.saveFile(`${this.jobId}_FINAL.md`, finalContent);
        this.emitProgress('WORKFLOW_COMPLETE', 'completed', {
            workflowName: workflow.name,
            totalNodes: nodes.length
        });

        return { status: 'completed', results };
    }

    // Avaliar condição dinâmica para loops
    _evaluateCondition(condition, data) {
        if (!condition) return false;

        try {
            // Suporta: "score_final < 80", "score < 85", "status != APPROVED"
            const match = condition.match(/^(\w+)\s*(>=|<=|>|<|==|!=)\s*(.+)$/);
            if (!match) return false;

            const [, field, operator, valueStr] = match;
            const fieldValue = data[field];
            const compareValue = isNaN(valueStr) ? valueStr.trim() : Number(valueStr);

            switch (operator) {
                case '<': return fieldValue < compareValue;
                case '>': return fieldValue > compareValue;
                case '<=': return fieldValue <= compareValue;
                case '>=': return fieldValue >= compareValue;
                case '==': return String(fieldValue) === String(compareValue);
                case '!=': return String(fieldValue) !== String(compareValue);
                default: return false;
            }
        } catch (e) {
            console.warn(`[CUSTOM-RUNNER] Condição inválida: ${condition} — ${e.message}`);
            return false;
        }
    }
}

// ============================================================================
// HANDLER (chamado pelo server.js)
// ============================================================================

async function handleCustomPipelineRun(options) {
    const { workflow, briefing, jobId, io, emitStateUpdate } = options;

    const runner = new CustomPipelineRunner({
        jobId,
        io,
        emitStateUpdate,
        historyRoot: options.historyRoot || path.join(__dirname, '..', 'history')
    });

    try {
        const result = await runner.runWorkflow(workflow, briefing);
        return result;
    } catch (error) {
        console.error(`[CUSTOM-PIPELINE] Fatal error: ${error.message}`);
        return { status: 'failed', error: error.message };
    }
}

module.exports = { CustomPipelineRunner, handleCustomPipelineRun };
