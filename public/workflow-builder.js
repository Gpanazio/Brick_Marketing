// ============================================================================
// BRICK AI WAR ROOM — WORKFLOW BUILDER (Free-Form Engine)
// Nós livres — crie qualquer agente com qualquer prompt e modelo
// ============================================================================

const WorkflowBuilder = (() => {
    // ────── STATE ──────
    let agents = [];           // existing roles (optional templates)
    let modelCatalog = {};
    let workflow = {
        id: null,
        name: '',
        description: '',
        version: '1.0',
        nodes: [],
        connections: [],
        loops: []
    };
    let selectedNodeId = null;
    let canvasOffset = { x: 0, y: 0 };
    let canvasScale = 1;
    let nextNodeNum = 1;
    let isConnecting = false;
    let connectFrom = null;
    let mousePos = { x: 0, y: 0 };
    let templatesCollapsed = true; // start collapsed

    const $ = (sel) => document.querySelector(sel);
    const $$ = (sel) => document.querySelectorAll(sel);

    // ────── MODEL CATALOG (hardcoded fallback + API) ──────
    const DEFAULT_MODELS = [
        { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash', provider: 'google', tier: 'fast' },
        { id: 'gemini-3-pro-preview', label: 'Gemini 3 Pro', provider: 'google', tier: 'pro' },
        { id: 'openai/gpt-5.1', label: 'GPT 5.1', provider: 'openrouter', tier: 'pro' },
        { id: 'anthropic/claude-sonnet-4.5', label: 'Sonnet 4.5', provider: 'openrouter', tier: 'pro' },
        { id: 'anthropic/claude-opus-4.6', label: 'Opus 4.6', provider: 'openrouter', tier: 'ultra' },
        { id: 'deepseek/deepseek-v3.2', label: 'DeepSeek V3.2', provider: 'openrouter', tier: 'fast' },
        { id: 'x-ai/grok-3-mini', label: 'Grok 3 Mini', provider: 'openrouter', tier: 'fast' },
    ];

    // ────── INIT ──────
    async function init() {
        await loadAgents();
        setupCanvasEvents();
        setupSidebar();
        renderSidebar();
        // Always start with a Raw Idea node
        addRawIdeaNode();
        renderCanvas();
        renderConfigPanel();
        renderStatusBar();
        console.log('[WORKFLOW-BUILDER] Free-form initialized');
    }

    // ────── API ──────
    async function loadAgents() {
        try {
            const res = await fetch('/api/agents');
            const data = await res.json();
            agents = data.agents || [];
            modelCatalog = data.modelCatalog || {};
        } catch (e) {
            console.warn('Could not load agents, using defaults');
        }
    }

    async function loadWorkflowList() {
        try {
            const res = await fetch('/api/workflows');
            return (await res.json()).workflows || [];
        } catch (e) { return []; }
    }

    function saveWorkflow() {
        const name = ($('#workflowName')?.value || '').trim() || workflow.name;
        if (!name) {
            // Show save modal for naming
            showSaveModal();
            return;
        }
        workflow.name = name;
        doSave();
    }

    function showSaveModal() {
        const m = $('#saveModal');
        if (!m) return;
        const input = m.querySelector('#saveNameInput');
        if (input) input.value = workflow.name || '';
        m.classList.add('visible');
        setTimeout(() => input?.focus(), 100);
    }

    async function confirmSave() {
        const input = $('#saveNameInput');
        const name = input?.value?.trim();
        if (!name) { toast('Digite um nome', 'error'); return; }
        workflow.name = name;
        $('#workflowName').value = name;
        closeModal('saveModal');
        await doSave();
    }

    async function doSave() {
        if (!workflow.nodes.length) { toast('Adicione nós primeiro', 'error'); return; }
        const method = workflow.id ? 'PUT' : 'POST';
        const url = workflow.id ? `/api/workflows/${workflow.id}` : '/api/workflows';
        try {
            const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(workflow) });
            const data = await res.json();
            if (data.success) {
                workflow.id = data.workflow.id;
                toast(`"${workflow.name}" salvo em Custom Nodes ✓`, 'success');
            }
            else toast(data.error || 'Erro ao salvar', 'error');
        } catch (e) { toast('Erro de conexão', 'error'); }
    }

    async function loadWorkflowById(id) {
        try {
            const res = await fetch(`/api/workflows/${id}`);
            const data = await res.json();
            if (data.id) {
                workflow = data;
                selectedNodeId = null;
                nextNodeNum = workflow.nodes.length + 1;
                $('#workflowName').value = workflow.name || '';
                renderCanvas();
                renderConfigPanel();
                renderStatusBar();
                toast(`"${workflow.name}" carregado`, 'success');
            }
        } catch (e) { toast('Erro ao carregar', 'error'); }
    }

    async function runWorkflow() {
        const briefing = $('#runBriefing')?.value?.trim();
        if (!briefing) { toast('Digite o briefing', 'error'); return; }
        if (!workflow.id) { toast('Salve primeiro', 'error'); return; }
        try {
            const res = await fetch(`/api/workflows/${workflow.id}/run`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ briefing, title: workflow.name })
            });
            const data = await res.json();
            if (data.success) { toast(`Pipeline iniciado: ${data.jobId}`, 'success'); closeModal('runModal'); }
            else toast(data.error || 'Erro', 'error');
        } catch (e) { toast('Erro de conexão', 'error'); }
    }

    // ────── SIDEBAR ──────
    function setupSidebar() {
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('filter-tag')) {
                $$('.filter-tag').forEach(t => t.classList.remove('active'));
                e.target.classList.add('active');
                renderSidebar();
            }
        });
        $('#agentSearch')?.addEventListener('input', () => renderSidebar());
    }

    function renderSidebar() {
        const container = $('#agentsList');
        if (!container) return;
        const activeFilter = $('.filter-tag.active')?.dataset?.filter || 'all';
        const search = ($('#agentSearch')?.value || '').toLowerCase();

        // The "+ FREE NODE" button always at top
        let html = `
            <div class="agent-card add-free-node" id="btn-add-free-node">
                <div class="agent-led" style="background:var(--red);box-shadow:0 0 8px var(--red-glow);"></div>
                <div class="agent-info">
                    <div class="agent-name" style="color:var(--red);">+ NÓ LIVRE</div>
                    <div class="agent-meta">Prompt + modelo customizado</div>
                </div>
            </div>
        `;

        // Show existing roles as optional templates (collapsible)
        if (activeFilter !== 'free') {
            let filtered = agents;
            if (activeFilter !== 'all') {
                filtered = filtered.filter(a => a.pipelines?.includes(activeFilter));
            }
            if (search) {
                filtered = filtered.filter(a =>
                    a.title.toLowerCase().includes(search) ||
                    a.id.toLowerCase().includes(search)
                );
            }

            if (filtered.length > 0) {
                const arrow = templatesCollapsed ? '▸' : '▾';
                html += `
                    <div class="sidebar-divider collapsible" id="btn-toggle-templates">
                        <span>${arrow} TEMPLATES (${filtered.length})</span>
                    </div>
                `;

                if (!templatesCollapsed) {
                    html += filtered.map(agent => `
                        <div class="agent-card template-card" draggable="true" data-agent-id="${agent.id}" data-agent-file="${agent.filename}">
                            <div class="agent-led ${getProviderClass(agent.providerHint)}"></div>
                            <div class="agent-info">
                                <div class="agent-name">${agent.title}</div>
                                <div class="agent-meta">${agent.defaultModel}</div>
                            </div>
                            <span class="agent-pipeline-badge">${agent.pipelines?.[0] || ''}</span>
                        </div>
                    `).join('');
                }
            }
        }

        container.innerHTML = html;

        // Free node click
        $('#btn-add-free-node')?.addEventListener('click', () => addFreeNode());

        // Toggle templates
        $('#btn-toggle-templates')?.addEventListener('click', () => {
            templatesCollapsed = !templatesCollapsed;
            renderSidebar();
        });

        // Template drag events
        container.querySelectorAll('.agent-card[draggable]').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/agent-id', card.dataset.agentId);
                e.dataTransfer.setData('application/agent-file', card.dataset.agentFile);
                card.classList.add('dragging');
            });
            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                $('.canvas-container')?.classList.remove('drag-over');
            });
        });
    }

    function getProviderClass(hint) {
        const map = { 'gemini-flash': 'google', 'gemini-pro': 'google', 'openai': 'openai', 'sonnet': 'sonnet', 'opus': 'opus', 'deepseek': 'deepseek', 'grok': 'grok', 'minimax': 'minimax' };
        return map[hint] || 'default';
    }

    function getProviderFromModel(m) {
        if (!m) return 'default';
        m = m.toLowerCase();
        if (m.includes('gemini')) return 'google';
        if (m.includes('gpt') || m.includes('openai')) return 'openai';
        if (m.includes('sonnet')) return 'sonnet';
        if (m.includes('opus')) return 'opus';
        if (m.includes('deepseek')) return 'deepseek';
        if (m.includes('grok')) return 'grok';
        return 'default';
    }

    // ────── NODE MANAGEMENT ──────

    // Raw Idea is the mandatory first node — represents user input (briefing)
    function addRawIdeaNode() {
        const existing = workflow.nodes.find(n => n.id === 'raw_idea');
        if (existing) return;

        const node = {
            id: 'raw_idea',
            role: null,
            roleFile: null,
            label: 'RAW IDEA',
            isRawIdea: true,
            model: { primary: null, fallback: null },
            position: { x: 300, y: 40 },
            config: {
                expectJSON: false,
                systemPrompt: '',
                contextInjections: []
            }
        };
        workflow.nodes.push(node);
    }

    function addFreeNode(x, y) {
        const col = (workflow.nodes.length - 1) % 3;
        const row = Math.floor((workflow.nodes.length - 1) / 3);
        x = x || 60 + col * 260;
        y = y || 200 + row * 160;
        x = Math.round(x / 20) * 20;
        y = Math.round(y / 20) * 20;

        const nodeId = `node_${nextNodeNum++}`;
        const node = {
            id: nodeId,
            role: null,
            roleFile: null,
            label: `Agente ${nextNodeNum - 1}`,
            model: {
                primary: { provider: 'google', model: 'gemini-3-flash-preview' },
                fallback: null
            },
            position: { x, y },
            config: {
                expectJSON: false,
                systemPrompt: '',
                contextInjections: []
            }
        };

        workflow.nodes.push(node);
        renderCanvas();
        selectNode(nodeId);
        toast('Nó livre adicionado', 'success');
    }

    function addNodeFromTemplate(agentId, agentFile, x, y) {
        const agent = agents.find(a => a.id === agentId);
        if (!agent) return;
        x = Math.round(x / 20) * 20;
        y = Math.round(y / 20) * 20;

        const nodeId = `node_${nextNodeNum++}`;

        let primaryProvider = 'google', primaryModel = 'gemini-3-flash-preview';
        const ml = agent.defaultModel?.toLowerCase() || '';
        if (ml.includes('opus')) { primaryProvider = 'openrouter'; primaryModel = 'anthropic/claude-opus-4.6'; }
        else if (ml.includes('sonnet')) { primaryProvider = 'openrouter'; primaryModel = 'anthropic/claude-sonnet-4.5'; }
        else if (ml.includes('gpt')) { primaryProvider = 'openrouter'; primaryModel = 'openai/gpt-5.1'; }
        else if (ml.includes('pro')) { primaryProvider = 'google'; primaryModel = 'gemini-3-pro-preview'; }

        const node = {
            id: nodeId,
            role: agentId,
            roleFile: agentFile,
            label: agent.title,
            model: {
                primary: { provider: primaryProvider, model: primaryModel },
                fallback: { provider: 'google', model: 'gemini-3-flash-preview' }
            },
            position: { x, y },
            config: {
                expectJSON: false,
                systemPrompt: '',
                contextInjections: []
            }
        };

        workflow.nodes.push(node);
        renderCanvas();
        selectNode(nodeId);
        toast(`${agent.title} adicionado como template`, 'success');
    }

    function removeNode(nodeId) {
        // Cannot remove Raw Idea
        if (nodeId === 'raw_idea') { toast('Raw Idea não pode ser removido', 'error'); return; }

        workflow.nodes = workflow.nodes.filter(n => n.id !== nodeId);
        workflow.connections = workflow.connections.filter(c => {
            if (c.from === nodeId) return false;
            if (Array.isArray(c.to)) { c.to = c.to.filter(t => t !== nodeId); return c.to.length > 0; }
            return c.to !== nodeId;
        });
        workflow.loops = workflow.loops.filter(l => l.from !== nodeId && l.to !== nodeId);
        if (selectedNodeId === nodeId) { selectedNodeId = null; renderConfigPanel(); }
        renderCanvas();
        toast('Nó removido', 'success');
    }

    function selectNode(nodeId) {
        selectedNodeId = nodeId;
        renderCanvas();
        renderConfigPanel();
    }

    // ────── CONNECTIONS ──────
    function startConnection(nodeId) { isConnecting = true; connectFrom = nodeId; }

    function finishConnection(targetId) {
        if (!connectFrom || connectFrom === targetId) return;
        const exists = workflow.connections.find(c => {
            if (c.from !== connectFrom) return false;
            return Array.isArray(c.to) ? c.to.includes(targetId) : c.to === targetId;
        });
        if (exists) return;

        const fromConn = workflow.connections.find(c => c.from === connectFrom);
        if (fromConn) {
            if (Array.isArray(fromConn.to)) { fromConn.to.push(targetId); fromConn.type = 'parallel'; }
            else { fromConn.to = [fromConn.to, targetId]; fromConn.type = 'parallel'; }
        } else {
            workflow.connections.push({ from: connectFrom, to: targetId, type: 'sequential' });
        }
        isConnecting = false; connectFrom = null;
        renderCanvas();
    }

    // ────── CANVAS ──────
    function setupCanvasEvents() {
        const canvas = $('.canvas-container');
        if (!canvas) return;

        canvas.addEventListener('dragover', (e) => { e.preventDefault(); canvas.classList.add('drag-over'); });
        canvas.addEventListener('dragleave', () => canvas.classList.remove('drag-over'));
        canvas.addEventListener('drop', (e) => {
            e.preventDefault();
            canvas.classList.remove('drag-over');
            const agentId = e.dataTransfer.getData('application/agent-id');
            const agentFile = e.dataTransfer.getData('application/agent-file');
            if (agentId) {
                const rect = canvas.getBoundingClientRect();
                const x = (e.clientX - rect.left - canvasOffset.x) / canvasScale;
                const y = (e.clientY - rect.top - canvasOffset.y) / canvasScale;
                addNodeFromTemplate(agentId, agentFile, x, y);
            }
        });

        let isPanning = false, panStart = { x: 0, y: 0 };
        canvas.addEventListener('mousedown', (e) => {
            if (e.target === canvas || e.target.classList.contains('canvas-grid')) {
                isPanning = true;
                panStart = { x: e.clientX - canvasOffset.x, y: e.clientY - canvasOffset.y };
                canvas.style.cursor = 'grabbing';
                selectedNodeId = null; renderConfigPanel(); renderCanvas();
            }
        });

        document.addEventListener('mousemove', (e) => {
            mousePos = { x: e.clientX, y: e.clientY };
            if (isPanning || isConnecting) e.preventDefault();
            if (isPanning) { canvasOffset.x = e.clientX - panStart.x; canvasOffset.y = e.clientY - panStart.y; updateTransform(); }
            if (isConnecting) renderGhostLine();
        });

        document.addEventListener('mouseup', () => {
            if (isPanning) { isPanning = false; canvas.style.cursor = ''; }
            if (isConnecting) { isConnecting = false; connectFrom = null; renderCanvas(); }
        });

        canvas.addEventListener('wheel', (e) => {
            e.preventDefault();
            canvasScale = Math.max(0.3, Math.min(2, canvasScale + (e.deltaY > 0 ? -0.05 : 0.05)));
            updateTransform();
            renderStatusBar();
        });

        document.addEventListener('keydown', (e) => {
            if ((e.key === 'Delete' || e.key === 'Backspace') && selectedNodeId &&
                document.activeElement.tagName !== 'INPUT' && document.activeElement.tagName !== 'TEXTAREA' &&
                document.activeElement.tagName !== 'SELECT') {
                removeNode(selectedNodeId);
            }
        });
    }

    function updateTransform() {
        const w = $('.canvas-world');
        if (w) w.style.transform = `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${canvasScale})`;
    }

    // ────── RENDER: CANVAS ──────
    function renderCanvas() {
        const nc = $('.canvas-nodes');
        if (!nc) return;

        // Hide hint if we have more than just raw_idea
        const hint = $('#canvasHint');
        if (hint) hint.style.opacity = workflow.nodes.length > 1 ? '0' : '1';

        nc.innerHTML = workflow.nodes.map(node => {
            const isRaw = node.isRawIdea;
            const provider = isRaw ? 'raw' : getProviderFromModel(node.model?.primary?.model);
            const sel = node.id === selectedNodeId;
            const mdl = isRaw ? 'USER INPUT' : (node.model?.primary?.model?.split('/').pop() || 'default');
            const isFree = !node.roleFile && !isRaw;

            return `
                <div class="canvas-node ${sel ? 'selected' : ''} ${isFree ? 'free-node' : ''} ${isRaw ? 'raw-idea-node' : ''}"
                     data-node-id="${node.id}"
                     style="left:${node.position.x}px; top:${node.position.y}px;">
                    <div class="node-provider-bar ${provider}"></div>
                    <div class="node-content">
                        <div class="node-title">${node.label || 'Sem nome'}</div>
                        <div class="node-subtitle">${isRaw ? 'BRIEFING DO USUÁRIO' : (isFree ? 'NÓ LIVRE' : node.role)}</div>
                        <div class="node-model-tag">${mdl}</div>
                    </div>
                    <div class="node-port port-out" data-node-id="${node.id}" data-port="out"></div>
                    ${isRaw ? '' : `
                        <div class="node-port port-in" data-node-id="${node.id}" data-port="in"></div>
                        <div class="node-delete" data-node-id="${node.id}">&times;</div>
                    `}
                </div>
            `;
        }).join('');

        // Node drag + select (selection is visual-only during drag to avoid DOM destruction)
        nc.querySelectorAll('.canvas-node').forEach(el => {
            const nodeId = el.dataset.nodeId;
            el.addEventListener('mousedown', (e) => {
                e.preventDefault();
                if (e.target.classList.contains('node-port') || e.target.classList.contains('node-delete')) return;
                e.stopPropagation();
                e.preventDefault();

                // Visual-only selection (no re-render)
                nc.querySelectorAll('.canvas-node.selected').forEach(n => n.classList.remove('selected'));
                el.classList.add('selected');

                let hasMoved = false;
                const rect = el.getBoundingClientRect();
                const ox = e.clientX - rect.left, oy = e.clientY - rect.top;

                const onMove = (me) => {
                    hasMoved = true;
                    const cr = $('.canvas-container').getBoundingClientRect();
                    const node = workflow.nodes.find(n => n.id === nodeId);
                    if (node) {
                        node.position.x = Math.round(((me.clientX - cr.left - canvasOffset.x - ox) / canvasScale) / 20) * 20;
                        node.position.y = Math.round(((me.clientY - cr.top - canvasOffset.y - oy) / canvasScale) / 20) * 20;
                        el.style.left = node.position.x + 'px';
                        el.style.top = node.position.y + 'px';
                        renderConnections();
                    }
                };
                const onUp = () => {
                    document.removeEventListener('mousemove', onMove);
                    document.removeEventListener('mouseup', onUp);
                    selectedNodeId = nodeId;
                    renderConfigPanel();
                    renderStatusBar();
                    if (!hasMoved) renderCanvas();
                };
                document.addEventListener('mousemove', onMove);
                document.addEventListener('mouseup', onUp);
            });
        });

        // Port events
        nc.querySelectorAll('.node-port').forEach(p => {
            p.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); if (p.dataset.port === 'out') startConnection(p.dataset.nodeId); });
            p.addEventListener('mouseup', (e) => { e.stopPropagation(); if (p.dataset.port === 'in' && isConnecting) finishConnection(p.dataset.nodeId); });
        });

        nc.querySelectorAll('.node-delete').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); removeNode(btn.dataset.nodeId); });
        });

        renderConnections();
        renderStatusBar();
    }

    function renderConnections() {
        const svg = $('.canvas-svg');
        if (!svg) return;
        const NW = 220, NH = 90;
        let s = '';

        // Vertical flow: bottom port → top port
        workflow.connections.forEach(conn => {
            const from = workflow.nodes.find(n => n.id === conn.from);
            if (!from) return;
            (Array.isArray(conn.to) ? conn.to : [conn.to]).forEach(tid => {
                const to = workflow.nodes.find(n => n.id === tid);
                if (!to) return;
                // From: bottom-center of source node
                const x1 = from.position.x + NW / 2, y1 = from.position.y + NH + 6;
                // To: top-center of target node
                const x2 = to.position.x + NW / 2, y2 = to.position.y - 6;
                const cy1 = y1 + Math.abs(y2 - y1) * 0.4;
                const cy2 = y2 - Math.abs(y2 - y1) * 0.4;
                s += `<path class="connection-line" d="M${x1},${y1} C${x1},${cy1} ${x2},${cy2} ${x2},${y2}"/>`;
                s += `<circle class="connection-dot" cx="${x2}" cy="${y2}" r="4"/>`;
            });
        });

        // Loops: horizontal arc (since main flow is vertical)
        workflow.loops.forEach(loop => {
            const from = workflow.nodes.find(n => n.id === loop.from);
            const to = workflow.nodes.find(n => n.id === loop.to);
            if (!from || !to) return;
            const x1 = from.position.x + NW + 6, y1 = from.position.y + NH / 2;
            const x2 = to.position.x + NW + 6, y2 = to.position.y + NH / 2;
            const cx = Math.max(x1, x2) + 80;
            s += `<path class="loop-line" d="M${x1},${y1} Q${cx},${(y1 + y2) / 2} ${x2},${y2}"/>`;
            s += `<text class="loop-label" x="${cx - 5}" y="${(y1 + y2) / 2}" text-anchor="start">${loop.condition || 'loop'} (max ${loop.maxIterations || 3})</text>`;
        });

        svg.innerHTML = s;
    }

    function renderGhostLine() {
        const svg = $('.canvas-svg');
        if (!svg || !connectFrom) return;
        const NW = 220, NH = 90;
        const from = workflow.nodes.find(n => n.id === connectFrom);
        if (!from) return;
        const cr = $('.canvas-container').getBoundingClientRect();
        // Ghost line from bottom-center of source
        const x1 = from.position.x + NW / 2, y1 = from.position.y + NH + 6;
        const x2 = (mousePos.x - cr.left - canvasOffset.x) / canvasScale;
        const y2 = (mousePos.y - cr.top - canvasOffset.y) / canvasScale;
        renderConnections();
        const g = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        g.setAttribute('class', 'connection-line-ghost');
        g.setAttribute('d', `M${x1},${y1} L${x2},${y2}`);
        svg.appendChild(g);
    }

    // ────── RENDER: CONFIG PANEL ──────
    function renderConfigPanel() {
        const body = $('.config-body');
        if (!body) return;

        if (!selectedNodeId) {
            body.innerHTML = `<div class="config-empty">Selecione um nó<br>para configurar</div>`;
            return;
        }

        const node = workflow.nodes.find(n => n.id === selectedNodeId);
        if (!node) return;

        // Raw Idea has a special config
        if (node.isRawIdea) {
            body.innerHTML = `
                <div class="config-section">
                    <div class="config-label">RAW IDEA</div>
                    <p style="font-size:11px;color:var(--gray-300);line-height:1.6;">
                        Este é o nó de entrada. O <strong>briefing</strong> que você digitar ao executar o workflow será injetado aqui e passado para os nós conectados à saída.
                    </p>
                    <p style="font-size:10px;color:var(--gray-500);margin-top:8px;">
                        Conecte a porta <span style="color:var(--red);">●</span> de saída deste nó à porta de entrada do primeiro agente.
                    </p>
                </div>
                <div class="config-section">
                    <div class="config-label">NOME</div>
                    <input class="config-input" id="cfgLabel" value="${node.label || 'RAW IDEA'}">
                </div>
            `;
            $('#cfgLabel')?.addEventListener('input', (e) => { node.label = e.target.value; renderCanvas(); });
            return;
        }

        const isFree = !node.roleFile;

        const allModels = [
            ...DEFAULT_MODELS,
            ...(modelCatalog.google || []).map(m => ({ ...m, provider: 'google' })),
            ...(modelCatalog.openrouter || []).map(m => ({ ...m, provider: 'openrouter' }))
        ];
        const seenIds = new Set();
        const uniqueModels = allModels.filter(m => { if (seenIds.has(m.id)) return false; seenIds.add(m.id); return true; });

        const currentPrimary = `${node.model?.primary?.provider}::${node.model?.primary?.model}`;
        const currentFallback = node.model?.fallback ? `${node.model.fallback.provider}::${node.model.fallback.model}` : '';

        body.innerHTML = `
            <div class="config-section">
                <div class="config-label">NOME DO NÓ</div>
                <input class="config-input" id="cfgLabel" value="${node.label || ''}">
            </div>

            ${isFree ? '' : `
            <div class="config-section">
                <div class="config-label">ROLE TEMPLATE</div>
                <div style="font-size:11px;color:var(--gray-300);padding:4px 0;">${node.roleFile}</div>
                <button class="btn btn-sm btn-ghost" id="cfgPreviewRole">PREVIEW</button>
                <button class="btn btn-sm btn-ghost" id="cfgDetachRole" style="color:var(--orange-sonnet);border-color:var(--orange-sonnet);margin-left:4px;">DESACOPLAR</button>
            </div>
            `}

            <div class="config-section">
                <div class="config-label">SYSTEM PROMPT ${isFree ? '(OBRIGATÓRIO)' : '(OVERRIDE do role)'}</div>
                <textarea class="config-textarea" id="cfgPrompt" placeholder="${isFree ? 'Escreva o system prompt deste agente...' : 'Vazio = usa o role file. Preencha para substituir.'}">${node.config?.systemPrompt || ''}</textarea>
            </div>

            <div class="config-section">
                <div class="config-label">MODELO PRIMÁRIO</div>
                <select class="config-select" id="cfgPrimaryModel">
                    ${uniqueModels.map(m => `<option value="${m.provider}::${m.id}" ${currentPrimary === `${m.provider}::${m.id}` ? 'selected' : ''}>${m.label} (${m.tier})</option>`).join('')}
                </select>
            </div>

            <div class="config-section">
                <div class="config-label">MODELO FALLBACK</div>
                <select class="config-select" id="cfgFallbackModel">
                    <option value="">Nenhum</option>
                    ${uniqueModels.map(m => `<option value="${m.provider}::${m.id}" ${currentFallback === `${m.provider}::${m.id}` ? 'selected' : ''}>${m.label} (${m.tier})</option>`).join('')}
                </select>
            </div>

            <div class="config-section">
                <div class="config-toggle">
                    <span class="config-toggle-label">Esperar JSON</span>
                    <div class="toggle-switch ${node.config?.expectJSON ? 'active' : ''}" id="cfgExpectJSON"></div>
                </div>
            </div>

            <div class="config-section">
                <div class="config-label">LOOP</div>
                <button class="btn btn-sm" id="cfgAddLoop">+ LOOP</button>
            </div>

            <div class="config-section" style="margin-top:20px;border-top:1px solid var(--border);padding-top:16px;">
                <button class="btn btn-sm" id="cfgDuplicate" style="margin-bottom:8px;">DUPLICAR NÓ</button>
                <button class="btn btn-sm" id="cfgRemoveNode" style="color:var(--red);border-color:var(--red-dim);">REMOVER NÓ</button>
            </div>
        `;

        // Bind events
        $('#cfgLabel')?.addEventListener('input', (e) => { node.label = e.target.value; renderCanvas(); });
        $('#cfgPrompt')?.addEventListener('input', (e) => { node.config.systemPrompt = e.target.value || ''; });

        $('#cfgPrimaryModel')?.addEventListener('change', (e) => {
            const [p, m] = e.target.value.split('::');
            node.model.primary = { provider: p, model: m };
            renderCanvas();
        });

        $('#cfgFallbackModel')?.addEventListener('change', (e) => {
            if (!e.target.value) { node.model.fallback = null; return; }
            const [p, m] = e.target.value.split('::');
            node.model.fallback = { provider: p, model: m };
        });

        $('#cfgExpectJSON')?.addEventListener('click', (e) => {
            node.config.expectJSON = !node.config.expectJSON;
            e.target.classList.toggle('active');
        });

        $('#cfgPreviewRole')?.addEventListener('click', async () => {
            if (!node.roleFile) return;
            try {
                const res = await fetch(`/api/roles/${node.roleFile}`);
                const data = await res.json();
                showRolePreview(data.filename, data.content);
            } catch (e) { toast('Erro ao carregar role', 'error'); }
        });

        $('#cfgDetachRole')?.addEventListener('click', () => {
            node.role = null;
            node.roleFile = null;
            renderCanvas();
            renderConfigPanel();
            toast('Role desacoplado — agora é nó livre', 'success');
        });

        $('#cfgAddLoop')?.addEventListener('click', () => {
            const others = workflow.nodes.filter(n => n.id !== selectedNodeId && !n.isRawIdea);
            if (!others.length) { toast('Adicione mais nós', 'error'); return; }
            const list = others.map(n => `${n.id} (${n.label})`).join(', ');
            const target = prompt(`Loop para qual nó?\n${list}`);
            const found = others.find(n => n.id === target || n.label === target);
            if (found) {
                const cond = prompt('Condição (ex: score < 80):') || 'score < 80';
                workflow.loops.push({ from: selectedNodeId, to: found.id, condition: cond, maxIterations: 3 });
                renderCanvas();
                toast('Loop adicionado', 'success');
            }
        });

        $('#cfgDuplicate')?.addEventListener('click', () => {
            const clone = JSON.parse(JSON.stringify(node));
            clone.id = `node_${nextNodeNum++}`;
            clone.label = node.label + ' (cópia)';
            clone.position = { x: node.position.x + 40, y: node.position.y + 40 };
            workflow.nodes.push(clone);
            renderCanvas();
            selectNode(clone.id);
            toast('Nó duplicado', 'success');
        });

        $('#cfgRemoveNode')?.addEventListener('click', () => removeNode(selectedNodeId));
    }

    // ────── RENDER: STATUS BAR ──────
    function renderStatusBar() {
        const l = $('.statusbar-left'), r = $('.statusbar-right');
        if (!l || !r) return;
        const free = workflow.nodes.filter(n => !n.roleFile && !n.isRawIdea).length;
        const tpl = workflow.nodes.filter(n => n.roleFile).length;
        l.innerHTML = `
            <div class="status-item"><div class="status-dot"></div> ONLINE</div>
            <div class="status-item">NODES: ${workflow.nodes.length} (${free} livres, ${tpl} templates)</div>
            <div class="status-item">CONNECTIONS: ${workflow.connections.length}</div>
            <div class="status-item">LOOPS: ${workflow.loops.length}</div>
        `;
        r.innerHTML = `
            <div class="status-item">ZOOM: ${Math.round(canvasScale * 100)}%</div>
            <div class="status-item">TEMPLATES: ${agents.length}</div>
        `;
    }

    // ────── MODALS ──────
    function showRolePreview(filename, content) {
        const o = $('#roleModal');
        if (!o) return;
        o.querySelector('.modal-title').textContent = filename;
        o.querySelector('.modal-body').innerHTML = `<pre style="white-space:pre-wrap;font-size:11px;color:var(--gray-300);line-height:1.6;">${content.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</pre>`;
        o.classList.add('visible');
    }

    async function showLoadModal() {
        const o = $('#loadModal');
        if (!o) return;
        const wfs = await loadWorkflowList();
        o.querySelector('.modal-body').innerHTML = wfs.map(w => `
            <div class="workflow-list-item" data-wf-id="${w.id}">
                <div class="workflow-list-info">
                    <div class="workflow-list-name">${w.name}</div>
                    <div class="workflow-list-desc">${w.description || ''} · ${w.nodes?.length || 0} nós</div>
                </div>
                ${w.isPreset ? '<span class="workflow-list-badge">PRESET</span>' : ''}
            </div>
        `).join('') || '<div class="config-empty">Nenhum workflow salvo</div>';
        o.querySelectorAll('.workflow-list-item').forEach(item => {
            item.addEventListener('click', () => { loadWorkflowById(item.dataset.wfId); closeModal('loadModal'); });
        });
        o.classList.add('visible');
    }

    function showRunModal() { $('#runModal')?.classList.add('visible'); }

    function showTutorial() { $('#tutorialModal')?.classList.add('visible'); }

    function closeModal(id) { $(`#${id}`)?.classList.remove('visible'); }

    function newWorkflow() {
        workflow = { id: null, name: '', description: '', version: '1.0', nodes: [], connections: [], loops: [] };
        selectedNodeId = null; nextNodeNum = 1;
        $('#workflowName').value = '';
        addRawIdeaNode();
        renderCanvas(); renderConfigPanel();
        toast('Novo workflow', 'success');
    }

    function toast(msg, type = 'info') {
        const c = $('.toast-container');
        if (!c) return;
        const t = document.createElement('div');
        t.className = `toast ${type}`;
        t.textContent = msg;
        c.appendChild(t);
        setTimeout(() => t.remove(), 3000);
    }

    return { init, saveWorkflow, confirmSave, showLoadModal, showRunModal, showTutorial, closeModal, newWorkflow, runWorkflow };
})();

document.addEventListener('DOMContentLoaded', WorkflowBuilder.init);
