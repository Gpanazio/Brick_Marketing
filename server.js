// Startup log - helps debug Railway deployment issues
console.log(`[STARTUP] Node ${process.version} | PID ${process.pid} | PORT ${process.env.PORT || 3000}`);
console.log(`[STARTUP] HOME=${process.env.HOME} | RAILWAY_ENVIRONMENT=${process.env.RAILWAY_ENVIRONMENT}`);

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');
const multer = require('multer');

// Config e Contratos
const CONFIG = require('./config/constants');
const { schemas, validate, getBotNameFromFilename } = require('./contracts/schemas');

// Multer config for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-z0-9.]/gi, '_');
        cb(null, `${timestamp}_${safeName}`);
    }
});
const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'text/plain', 'text/markdown', 'image/png', 'image/jpeg', 'image/webp'];
        if (allowed.includes(file.mimetype) || file.originalname.endsWith('.md')) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido'), false);
        }
    }
});

const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'brick-squad-2026';

// Trust Proxy (Railway/Load Balancer support)
app.set('trust proxy', 1);

// Socket.IO: Emite estado atualizado para todos os clientes
function emitStateUpdate(mode) {
    const state = {
        mode,
        briefing: getFilesForSocket('briefing', mode),
        wip: getFilesForSocket('wip', mode),
        done: getFilesForSocket('done', mode),
        failed: getFilesForSocket('failed', mode)
    };
    io.emit('stateUpdate', state);
    log('info', 'websocket_state_emitted', { mode, clients: io.engine.clientsCount });
}

// Helper para socket (sem content pra economizar banda)
function getFilesForSocket(dir, mode) {
    const root = getModeRoot(mode);
    const dirPath = path.join(root, dir);
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath).filter(f => !f.startsWith('.')).map(f => ({
        name: f,
        path: path.join(dir, f),
        mtime: fs.statSync(path.join(dirPath, f)).mtime.toISOString()
    }));
}

io.on('connection', (socket) => {
    log('info', 'websocket_client_connected', { id: socket.id });

    socket.on('subscribe', (mode) => {
        socket.join(mode);
        log('info', 'websocket_subscribed', { id: socket.id, mode });
    });

    socket.on('disconnect', () => {
        log('info', 'websocket_client_disconnected', { id: socket.id });
    });
});

// Métricas em memória (persiste em arquivo a cada 5min)
const METRICS_FILE = path.join(__dirname, '.metrics.json');
let metrics = {
    pipeline: {},
    requests: { total: 0, success: 0, failed: 0 },
    startedAt: new Date().toISOString()
};

function loadMetrics() {
    try {
        if (fs.existsSync(METRICS_FILE)) {
            metrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
        }
    } catch (e) { /* ignore */ }
}

function saveMetrics() {
    try {
        fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
    } catch (e) { /* ignore */ }
}

function trackStep(botName, success, durationMs, model = null) {
    if (!metrics.pipeline[botName]) {
        metrics.pipeline[botName] = { runs: 0, success: 0, failed: 0, totalMs: 0, fallbacks: 0 };
    }
    metrics.pipeline[botName].runs++;
    metrics.pipeline[botName].totalMs += durationMs;
    if (success) metrics.pipeline[botName].success++;
    else metrics.pipeline[botName].failed++;
    if (model && model.includes('gemini') && botName === 'copywriter') {
        metrics.pipeline[botName].fallbacks++;
    }
}

loadMetrics();
setInterval(saveMetrics, 5 * 60 * 1000); // Salva a cada 5min

// Paths - Use persistent volume for Railway
// Force persistent volume path on Railway (detect via RAILWAY_ENVIRONMENT or Railway-specific PORT behavior)
const IS_RAILWAY = process.env.RAILWAY_ENVIRONMENT || (process.env.PORT && !process.env.HOME?.includes('gabrielpanazio'));
const HISTORY_ROOT = IS_RAILWAY ? '/api/history' : (process.env.HISTORY_PATH || path.join(__dirname, 'history'));
console.log(`[STARTUP] IS_RAILWAY=${IS_RAILWAY} | HISTORY_ROOT=${HISTORY_ROOT}`);
const MARKETING_ROOT = path.join(HISTORY_ROOT, 'marketing');
const PROJETOS_ROOT = path.join(HISTORY_ROOT, 'projetos');
const IDEIAS_ROOT = path.join(HISTORY_ROOT, 'ideias');

// Helper to get root by mode
const getModeRoot = (mode) => {
    if (mode === 'projetos') return PROJETOS_ROOT;
    if (mode === 'ideias') return IDEIAS_ROOT;
    return MARKETING_ROOT; // default: marketing
};

// Structured logging
const log = (level, event, data = {}) => {
    console.log(JSON.stringify({
        level,
        event,
        ...data,
        timestamp: new Date().toISOString()
    }));
};

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));

// Disable cache for index.html to ensure updates are seen immediately
app.use((req, res, next) => {
    if (req.path === '/' || req.path === '/index.html') {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Expires', '-1');
        res.set('Pragma', 'no-cache');
    }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

// Rate limiting para /api/state (proteção sem quebrar dashboard)
const stateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 60, // 60 requests por minuto
    message: { error: 'Too many requests, slow down' }
});
app.use('/api/state', stateLimiter);

// Ensure directories exist (including failed/)
console.log(`[STARTUP] Creating directories...`);
try {
    if (!fs.existsSync(HISTORY_ROOT)) {
        console.log(`[STARTUP] Creating HISTORY_ROOT: ${HISTORY_ROOT}`);
        fs.mkdirSync(HISTORY_ROOT, { recursive: true });
    }
    [MARKETING_ROOT, PROJETOS_ROOT, IDEIAS_ROOT].forEach(root => {
        ['briefing', 'wip', 'done', 'failed', 'feedback'].forEach(dir => {
            const dirPath = path.join(root, dir);
            if (!fs.existsSync(dirPath)) {
                console.log(`[STARTUP] Creating dir: ${dirPath}`);
                fs.mkdirSync(dirPath, { recursive: true });
            }
        });
    });
    console.log(`[STORAGE] History root: ${HISTORY_ROOT} (Railway: ${IS_RAILWAY ? 'YES' : 'NO'})`);
} catch (err) {
    console.error(`[STARTUP ERROR] Failed to create directories: ${err.message}`);
    console.error(`[STARTUP ERROR] Stack: ${err.stack}`);
    // Don't exit - let the app start anyway
}

// Auth middleware - ALLOW ALL READ-ONLY ACCESS FOR DASHBOARD
const authMiddleware = (req, res, next) => {
    // Allow public assets/root
    if (req.method === 'GET' && (req.path === '/' || !req.path.startsWith('/'))) {
        return next();
    }

    // Allow ALL GET requests to API (Read-Only Dashboard)
    // The dashboard needs state, history, metrics, architecture, etc.
    // We only protect write actions (POST, PUT, DELETE)
    if (req.method === 'GET') {
        return next();
    }

    // Allow human actions from UI (approve/feedback/revisions) without API key
    const publicWritePaths = ['/approve', '/feedback'];
    if (req.method === 'POST' && (
        publicWritePaths.includes(req.path) ||
        /^\/revisions\/[^/]+\/(approve|reject)$/.test(req.path)
    )) {
        return next();
    }

    // For other Write operations (POST/DELETE), require API Key
    const key = req.headers['x-api-key'] || req.query.key;
    if (key === API_KEY) {
        return next();
    }

    log('warn', 'unauthorized_write_attempt', { path: req.path, method: req.method });
    res.status(401).json({ error: 'Unauthorized' });
};

// Apply auth to all API routes
app.use('/api', authMiddleware);

// Helper to read directory
const getFiles = (dir, mode = 'marketing') => {
    const root = getModeRoot(mode);
    const dirPath = path.join(root, dir);
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath)
        .filter(f => !f.startsWith('.'))
        .filter(f => fs.statSync(path.join(dirPath, f)).isFile())
        .map(f => ({
            name: f,
            path: path.join(dir, f),
            content: fs.readFileSync(path.join(dirPath, f), 'utf-8'),
            mtime: fs.statSync(path.join(dirPath, f)).mtime.toISOString()
        }));
};

// API: Health check (Railway uses this to verify deployment)
app.get('/api/health', (req, res) => {
    res.status(200).json({
        status: 'online',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        port: PORT,
        node: process.version
    });
});

// API: Métricas do pipeline
app.get('/api/metrics', (req, res) => {
    const pipelineStats = {};
    for (const [bot, data] of Object.entries(metrics.pipeline)) {
        pipelineStats[bot] = {
            ...data,
            avgMs: data.runs > 0 ? Math.round(data.totalMs / data.runs) : 0,
            successRate: data.runs > 0 ? Math.round((data.success / data.runs) * 100) : 0
        };
    }
    res.json({
        uptime: metrics.startedAt,
        requests: metrics.requests,
        pipeline: pipelineStats,
        thresholds: CONFIG.THRESHOLDS
    });
});

// API: Config (read-only, expõe thresholds e models)
app.get('/api/config', (req, res) => {
    res.json({
        thresholds: CONFIG.THRESHOLDS,
        models: CONFIG.MODELS,
        paths: CONFIG.PATHS
    });
});

// API: Estimativa de custo do pipeline
app.get('/api/estimate', (req, res) => {
    const mode = req.query.mode || 'marketing';

    // Definir etapas por modo (DEVE espelhar os scripts run-*.sh)
    const pipelines = {
        marketing: [
            { name: 'VALIDATOR', model: 'flash' },
            { name: 'AUDIENCE', model: 'flash' },
            { name: 'RESEARCH', model: 'flash' },
            { name: 'CLAIMS', model: 'flash' },
            { name: 'COPYWRITER', model: 'gpt', label: 'Copy A (GPT)' },
            { name: 'COPYWRITER', model: 'flash', label: 'Copy B (Flash)' },
            { name: 'COPYWRITER', model: 'sonnet', label: 'Copy C (Sonnet)' },
            { name: 'BRAND_GUARDIANS', model: 'flash' },
            { name: 'COPY_SENIOR', model: 'gpt' },
            { name: 'WALL', model: 'opus' }
        ],
        projetos: [
            { name: 'BRAND_DIGEST', model: 'flash' },
            { name: 'CREATIVE_IDEATION', model: 'gpt', label: 'Ideation A (GPT)' },
            { name: 'CREATIVE_IDEATION', model: 'flash', label: 'Ideation B (Flash)' },
            { name: 'CREATIVE_IDEATION', model: 'sonnet', label: 'Ideation C (Sonnet)' },
            { name: 'CONCEPT_CRITIC', model: 'pro' },
            { name: 'EXECUTION_DESIGN', model: 'pro' },
            { name: 'PROPOSAL_WRITER', model: 'gpt' },
            { name: 'PROJECT_DIRECTOR', model: 'pro' }
        ],
        ideias: [
            { name: 'PAIN_CHECK', model: 'flash' },
            { name: 'MARKET_SCAN', model: 'flash' },
            { name: 'ANGLE_GEN', model: 'sonnet', label: 'Angel (Sonnet)' },
            { name: 'DEVIL_GEN', model: 'sonnet', label: 'Devil (Sonnet)' },
            { name: 'VIABILITY', model: 'opus' }
        ]
    };

    const steps = pipelines[mode] || pipelines.marketing;
    const outputCosts = CONFIG.MODEL_COSTS_OUTPUT || {};
    const inputCosts = CONFIG.MODEL_COSTS_INPUT || {};
    const avgOutputTokens = CONFIG.AVG_TOKENS_PER_STEP || {};
    const avgInputTokens = CONFIG.AVG_INPUT_TOKENS_PER_STEP || {};

    let totalCost = 0;
    const breakdown = steps.map(step => {
        const outTokens = avgOutputTokens[step.name] || 800;
        const inTokens = avgInputTokens[step.name] || 2000;
        const outCostPer1K = outputCosts[step.model] || 0.01;
        const inCostPer1K = inputCosts[step.model] || 0.001;
        const outCost = (outTokens / 1000) * outCostPer1K;
        const inCost = (inTokens / 1000) * inCostPer1K;
        const cost = outCost + inCost;
        totalCost += cost;
        return {
            step: step.label || step.name,
            model: step.model,
            inputTokens: inTokens,
            outputTokens: outTokens,
            cost: cost.toFixed(4)
        };
    });

    res.json({
        mode,
        steps: steps.length,
        totalCost: totalCost.toFixed(2),
        breakdown,
        note: 'Estimativa inclui input + output tokens. Custo real pode variar ±30%.'
    });
});

// API: Get all state (including failed, revisions, pending feedbacks)
app.get('/api/state', (req, res) => {
    const mode = req.query.mode || 'marketing';
    const root = getModeRoot(mode);
    const feedbackDir = path.join(root, 'feedback');

    // Pending feedbacks (status === 'pending')
    let pendingFeedbacks = [];
    if (fs.existsSync(feedbackDir)) {
        pendingFeedbacks = fs.readdirSync(feedbackDir)
            .filter(f => f.endsWith('.json'))
            .map(f => {
                try { return JSON.parse(fs.readFileSync(path.join(feedbackDir, f), 'utf-8')); }
                catch(e) { return null; }
            })
            .filter(f => f && f.status === 'pending')
            .map(f => ({ jobId: f.jobId || f.file, text: f.text || f.feedback, timestamp: f.timestamp }));
    }

    res.json({
        mode,
        briefing: getFiles('briefing', mode),
        wip: getFiles('wip', mode),
        done: getFiles('done', mode),
        failed: getFiles('failed', mode),
        revisions: getRevisions(mode),
        pendingFeedbacks
    });
});

// API: Get pending briefings (for watcher)
app.get('/api/pending', (req, res) => {
    const mode = req.query.mode || 'marketing';
    res.json({ briefings: getFiles('briefing', mode) });
});

// Telegram notification (legacy - keep for direct messages)
async function notifyTelegram(message) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' })
        });
        log('info', 'telegram_notification_sent');
    } catch (e) {
        log('error', 'telegram_notification_failed', { error: e.message });
    }
}

// Douglas notification via OpenClaw Wake API
async function notifyDouglas(data) {
    // OpenClaw Wake: send system event to Douglas session via Gateway API
    const wakeMessage = data.feedbackAction
        ? `🔄 FEEDBACK HUMANO RECEBIDO - Projeto ${data.jobId || 'N/A'} (${data.mode || 'marketing'}): "${data.feedbackText || '(vazio)'}". Feedback salvo em history/${data.mode}/feedback/. Aguardando processamento.`
        : `📋 NOVO BRIEFING RECEBIDO - ${data.title || 'Sem título'} (${data.mode || 'marketing'}, ${data.filesCount || 0} anexos). JobID: ${data.jobId}. Aguardando processamento via War Room.`;

    // Try OpenClaw Gateway Wake API (local gateway)
    try {
        const gatewayUrl = process.env.OPENCLAW_GATEWAY_URL || 'http://localhost:18789';
        await fetch(`${gatewayUrl}/api/cron/wake`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                text: wakeMessage,
                mode: 'now'
            })
        });
        log('info', 'openclaw_wake_sent', { jobId: data.jobId, type: data.feedbackAction ? 'feedback' : 'briefing' });
    } catch (e) {
        log('warn', 'openclaw_wake_failed', { error: e.message });
    }

    // Fallback: Telegram notification (legacy)
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        return; // OpenClaw wake is enough
    }

    // Só envia Telegram aqui para FEEDBACK (evita duplicar alerta de briefing)
    if (!data.feedbackAction) {
        return;
    }

    const message = `🔄 FEEDBACK: ${data.feedbackText}

Projeto: ${data.jobId}
Modo: ${data.mode}`;

    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message
            })
        });
        log('info', 'douglas_command_sent', { jobId: data.jobId, type: 'feedback' });
    } catch (e) {
        log('error', 'douglas_command_failed', { error: e.message });
    }
}

// API: Create Briefing (from dashboard) - supports file uploads
app.post('/api/briefing', upload.array('files', 10), async (req, res) => {
    try {
        const { title, content, mode } = req.body;
        if (!title) return res.status(400).json({ error: 'Título obrigatório' });

        const root = getModeRoot(mode || 'marketing');
        const timestamp = Date.now();
        const jobId = `${timestamp}_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}`;
        const filename = `${jobId}.md`;
        const filePath = path.join(root, 'briefing', filename);

        // Ensure briefing dir exists
        const briefingDir = path.join(root, 'briefing');
        if (!fs.existsSync(briefingDir)) fs.mkdirSync(briefingDir, { recursive: true });

        // Build briefing content
        const modeLabel = mode === 'projetos' ? 'PROJETO' : 'BRIEFING';
        let fileContent = `# ${modeLabel}: ${title}\n`;
        fileContent += `**Date:** ${new Date().toISOString()}\n`;
        fileContent += `**Status:** PENDING\n`;
        fileContent += `**Mode:** ${mode || 'marketing'}\n`;
        fileContent += `**Job ID:** ${jobId}\n\n`;
        fileContent += `## Descrição\n${content || '(sem descrição)'}\n\n`;

        // Process uploaded files
        const uploadedFiles = req.files || [];
        if (uploadedFiles.length > 0) {
            fileContent += `## Anexos (${uploadedFiles.length} arquivo(s))\n`;
            fileContent += `> ⚠️ Douglas precisa processar esses anexos antes de passar pro squad.\n\n`;

            uploadedFiles.forEach((file, i) => {
                const fileInfo = {
                    original: file.originalname,
                    stored: file.filename,
                    path: file.path,
                    type: file.mimetype,
                    size: file.size
                };
                fileContent += `### Anexo ${i + 1}: ${file.originalname}\n`;
                fileContent += `- **Tipo:** ${file.mimetype}\n`;
                fileContent += `- **Tamanho:** ${(file.size / 1024).toFixed(1)}KB\n`;
                fileContent += `- **Path:** \`${file.path}\`\n\n`;
            });

            fileContent += `---\n**AGUARDANDO PROCESSAMENTO POR DOUGLAS**\n`;
        }

        fs.writeFileSync(filePath, fileContent);

        log('info', 'briefing_created', {
            filename,
            title,
            mode: mode || 'marketing',
            filesCount: uploadedFiles.length
        });

        // Notify Douglas via OpenClaw Wake + Telegram
        const briefingData = {
            title,
            mode: mode || 'marketing',
            filesCount: uploadedFiles.length,
            jobId
        };

        await notifyDouglas(briefingData); // Primary: OpenClaw system event

        const emoji = mode === 'projetos' ? '🎬' : '🚨';
        const typeLabel = mode === 'projetos' ? 'NOVO PROJETO DE CLIENTE' : 'NOVO BRIEFING';
        const filesNote = uploadedFiles.length > 0 ? `\n📎 *${uploadedFiles.length} anexo(s)* para processar` : '';
        await notifyTelegram(`${emoji} *${typeLabel} NO WAR ROOM*\n\n*Título:* ${title}${filesNote}\n\n_Douglas, aciona o squad!_`); // Fallback

        // WebSocket: notificar clientes
        emitStateUpdate(mode || 'marketing');

        res.json({ success: true, filename, mode: mode || 'marketing', filesCount: uploadedFiles.length });
    } catch (err) {
        log('error', 'briefing_create_failed', { error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// API: Submit result from agent (com validação de schema)
app.post('/api/result', (req, res) => {
    const { filename, content, category, botName, durationMs, model, mode } = req.body;
    const root = getModeRoot(mode || 'marketing');
    const targetCategory = category || 'wip';
    const filePath = path.join(root, targetCategory, filename);

    // Ensure category dir exists
    const categoryDir = path.join(root, targetCategory);
    if (!fs.existsSync(categoryDir)) fs.mkdirSync(categoryDir, { recursive: true });

    // Schema validation - valida output JSON dos agentes
    if (filename.endsWith('.json') && content) {
        try {
            const detectedBot = botName || getBotNameFromFilename(filename);
            if (detectedBot && schemas[detectedBot]) {
                const jsonContent = JSON.parse(content);
                const validation = validate(jsonContent, detectedBot);
                if (!validation.valid) {
                    log('warn', 'schema_validation_failed', {
                        filename,
                        botName: detectedBot,
                        errors: validation.errors
                    });
                }
            }
        } catch (e) {
            log('warn', 'json_parse_failed', { filename, error: e.message });
        }
    }

    if (botName && durationMs) {
        trackStep(botName, true, durationMs, model);
    }

    fs.writeFileSync(filePath, content);
    log('info', 'result_submitted', { filename, category: targetCategory, botName, mode: mode || 'marketing' });
    metrics.requests.total++;
    metrics.requests.success++;
    emitStateUpdate(mode || 'marketing');
    res.json({ success: true, filename, category: targetCategory });
});

// API: Move File (Approve/Reject)
app.post('/api/move', (req, res) => {
    const { filename, from, to, mode } = req.body;
    const root = getModeRoot(mode || 'marketing');
    const src = path.join(root, from, filename);
    const destDir = path.join(root, to);
    const dest = path.join(destDir, filename);

    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

    if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
        log('info', 'file_moved', { filename, from, to, mode: mode || 'marketing' });
        emitStateUpdate(mode || 'marketing');
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: Delete File
app.delete('/api/file', (req, res) => {
    const { category, filename, mode } = req.body;
    const root = getModeRoot(mode || 'marketing');
    const filePath = path.join(root, category, filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        log('info', 'file_deleted', { filename, category, mode: mode || 'marketing' });
        emitStateUpdate(mode || 'marketing');
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: Clear briefing after processing
app.post('/api/briefing/clear', (req, res) => {
    const { filename, mode } = req.body;
    const root = getModeRoot(mode || 'marketing');
    const filePath = path.join(root, 'briefing', filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        log('info', 'briefing_cleared', { filename, mode: mode || 'marketing' });
        emitStateUpdate(mode || 'marketing');
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: Dead Letter Queue - move failed jobs with metadata
app.post('/api/fail', (req, res) => {
    const { filename, step, error, originalContent } = req.body;
    const failedPath = path.join(MARKETING_ROOT, 'failed');

    // Save error metadata
    const meta = {
        originalFile: filename,
        failedAt: step,
        error: error,
        timestamp: new Date().toISOString()
    };

    const metaFilename = `${Date.now()}_${filename}.error.json`;
    fs.writeFileSync(path.join(failedPath, metaFilename), JSON.stringify(meta, null, 2));

    // Optionally save original content
    if (originalContent) {
        fs.writeFileSync(path.join(failedPath, filename), originalContent);
    }

    log('error', 'job_failed', { filename, step, error });
    res.json({ success: true, errorFile: metaFilename });
});

// API: Retry failed job (move back to briefing)
app.post('/api/retry', (req, res) => {
    const { filename } = req.body;
    const src = path.join(MARKETING_ROOT, 'failed', filename);
    const dest = path.join(MARKETING_ROOT, 'briefing', filename);

    if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
        // Clean up error metadata
        const errorFile = src + '.error.json';
        if (fs.existsSync(errorFile)) fs.unlinkSync(errorFile);
        log('info', 'job_retried', { filename });
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: Re-run job (move back to briefing and clear progress)
app.post('/api/rerun', (req, res) => {
    const { jobId, mode } = req.body;
    const root = getModeRoot(mode || 'marketing');

    // Encontrar arquivo de briefing original
    const briefingDir = path.join(root, 'briefing');
    let briefingFile = null;

    // Helper de busca - procura arquivo que contém o jobId
    const findFile = (dir, id) => {
        if (!fs.existsSync(dir)) return null;
        return fs.readdirSync(dir).find(f => f.includes(id));
    };

    // 1. Tenta na pasta briefing diretamente
    briefingFile = findFile(briefingDir, jobId);

    // 2. Se não achar, pode ser que o jobId do frontend veio do WIP (ID diferente do briefing).
    //    Procurar no WIP um arquivo com esse jobId que contenha o Job ID original no conteúdo.
    if (!briefingFile) {
        const wipDir = path.join(root, 'wip');
        if (fs.existsSync(wipDir)) {
            // Procurar RAW_IDEA ou PROCESSED que contenha referência ao briefing original
            const wipFiles = fs.readdirSync(wipDir).filter(f => f.includes(jobId));
            for (const wf of wipFiles) {
                const content = fs.readFileSync(path.join(wipDir, wf), 'utf-8');
                // Extrair Job ID original do conteúdo (ex: **Job ID:** 1770288147944_luta_de_boxe)
                const jobIdMatch = content.match(/\*\*Job ID:\*\*\s*(\S+)/);
                if (jobIdMatch) {
                    const originalJobId = jobIdMatch[1];
                    briefingFile = findFile(briefingDir, originalJobId);
                    if (briefingFile) {
                        log('info', 'rerun_found_via_content', { wipFile: wf, originalJobId });
                        break;
                    }
                }
            }

            // 3. Fallback: recuperar RAW_IDEA do WIP como briefing
            if (!briefingFile) {
                const rawFile = wipFiles.find(f => f.includes('RAW_IDEA'));
                const processedFile = wipFiles.find(f => f.includes('PROCESSED'));
                const sourceFile = rawFile || processedFile;

                if (sourceFile) {
                    // Criar um briefing limpo a partir do WIP
                    const cleanName = jobId + '.md';
                    fs.copyFileSync(path.join(wipDir, sourceFile), path.join(briefingDir, cleanName));
                    briefingFile = cleanName;
                    log('info', 'rerun_restored_from_wip', { source: sourceFile, newBriefing: cleanName });
                }
            }
        }
    }

    if (!briefingFile) {
        return res.status(404).json({ error: 'Briefing original não encontrado para re-run' });
    }

    // Limpar TODOS os arquivos WIP/DONE/FAILED relacionados a esse JobID
    // Também limpar por jobId extraído do conteúdo (pode ter IDs derivados)
    const idsToClean = [jobId];
    ['wip', 'done', 'failed', 'approved'].forEach(dir => {
        const dirPath = path.join(root, dir);
        if (fs.existsSync(dirPath)) {
            const files = fs.readdirSync(dirPath).filter(f => {
                return idsToClean.some(id => f.includes(id));
            });
            files.forEach(f => {
                fs.unlinkSync(path.join(dirPath, f));
                log('info', 'rerun_cleanup', { dir, file: f });
            });
        }
    });

    // "Tocar" o arquivo de briefing para mudar o mtime e o watcher pegar de novo
    const briefingPath = path.join(briefingDir, briefingFile);
    const content = fs.readFileSync(briefingPath, 'utf-8');
    fs.writeFileSync(briefingPath, content); // Re-escreve para atualizar timestamp

    log('info', 'job_rerun_triggered', { jobId, mode, briefingFile });
    emitStateUpdate(mode || 'marketing');
    res.json({ success: true, message: 'Job reiniciado', briefingFile });
});

// API: Get history
app.get('/api/history', (req, res) => {
    if (!fs.existsSync(HISTORY_ROOT)) {
        return res.json({ history: [] });
    }
    const files = fs.readdirSync(HISTORY_ROOT).filter(f => !f.startsWith('.')).map(f => ({
        name: f,
        content: fs.readFileSync(path.join(HISTORY_ROOT, f), 'utf-8'),
        mtime: fs.statSync(path.join(HISTORY_ROOT, f)).mtime.toISOString()
    }));
    files.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    res.json({ history: files });
});

// API: Squad Architecture (read-only)
app.get('/api/architecture', (req, res) => {
    // Tenta vários caminhos possíveis
    const possiblePaths = [
        path.join(__dirname, 'SQUAD_ARCHITECTURE.md'),
        path.join(process.cwd(), 'SQUAD_ARCHITECTURE.md'),
        path.join(__dirname, '..', 'SQUAD_ARCHITECTURE.md')
    ];

    let content = null;
    let usedPath = null;

    for (const p of possiblePaths) {
        if (fs.existsSync(p)) {
            content = fs.readFileSync(p, 'utf-8');
            usedPath = p;
            break;
        }
    }

    if (!content) {
        log('error', 'architecture_not_found', { searchedPaths: possiblePaths });
        return res.status(404).json({ error: 'SQUAD_ARCHITECTURE.md not found', searched: possiblePaths });
    }

    res.json({ content });
});

// API: Get pipeline configuration
app.get('/api/pipeline', (req, res) => {
    const mode = req.query.mode || 'marketing';
    const pipelinePath = path.join(__dirname, 'config', `pipeline-${mode}.json`);

    if (fs.existsSync(pipelinePath)) {
        const config = JSON.parse(fs.readFileSync(pipelinePath, 'utf-8'));
        res.json(config);
    } else {
        // Fallback to default marketing config
        const fallbackPath = path.join(__dirname, 'config', 'pipeline-marketing.json');
        if (fs.existsSync(fallbackPath)) {
            const config = JSON.parse(fs.readFileSync(fallbackPath, 'utf-8'));
            res.json(config);
        } else {
            res.status(404).json({ error: 'Pipeline config not found' });
        }
    }
});

// API: Save pipeline configuration
app.post('/api/pipeline', (req, res) => {
    const { nodes, mode } = req.body;
    if (!nodes) {
        return res.status(400).json({ error: 'Missing nodes config' });
    }

    const targetMode = mode || 'marketing';
    const pipelinePath = path.join(__dirname, 'config', `pipeline-${targetMode}.json`);

    // Determine version based on mode
    const version = targetMode === 'projetos' ? '2.0' : '3.3';

    const config = {
        nodes,
        version,
        mode: targetMode,
        lastUpdate: new Date().toISOString()
    };

    fs.writeFileSync(pipelinePath, JSON.stringify(config, null, 2));
    log('info', 'pipeline_config_updated', { mode: targetMode, nodes: Object.keys(nodes).length });
    res.json({ success: true, config });
});

// API: Archive to history
app.post('/api/archive', (req, res) => {
    const { filename, mode } = req.body;
    const baseDir = mode === 'projetos' ? PROJETOS_ROOT : MARKETING_ROOT;
    const src = path.join(baseDir, 'done', filename);
    const timestamp = new Date().toISOString().split('T')[0];
    const destFilename = `${timestamp}_${filename}`;
    const historyDir = path.join(baseDir, 'history');

    // Ensure history dir exists
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

    const dest = path.join(historyDir, destFilename);

    if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
        log('info', 'file_archived', { filename, archived: destFilename, mode });
        res.json({ success: true, archived: destFilename });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// Feedback route - recebe feedback humano e salva para processamento
app.post('/api/feedback', async (req, res) => {
    // Support both old format (file, action, type, text) and new format (jobId, feedback)
    const { file, action, type, text, routedTo, mode, jobId, feedback } = req.body;
    const timestamp = Date.now();

    const baseDir = mode === 'projetos' ? PROJETOS_ROOT : MARKETING_ROOT;
    const feedbackDir = path.join(baseDir, 'feedback');
    const historyDir = path.join(baseDir, 'history');
    if (!fs.existsSync(feedbackDir)) fs.mkdirSync(feedbackDir, { recursive: true });
    if (!fs.existsSync(historyDir)) fs.mkdirSync(historyDir, { recursive: true });

    // Archive current version before feedback
    if (file) {
        const currentFile = path.join(baseDir, 'wip', file);
        if (fs.existsSync(currentFile)) {
            const ext = path.extname(file);
            const base = path.basename(file, ext);
            const historyFile = path.join(historyDir, `${base}_${timestamp}${ext}`);
            fs.copyFileSync(currentFile, historyFile);
            log('info', 'version_archived', { original: file, archived: historyFile });
        }
    }

    const feedbackData = {
        timestamp: new Date().toISOString(),
        jobId: jobId || file,
        file,
        action: action || 'revision',
        type: type || 'human_feedback',
        text: text || feedback,
        routedTo,
        mode,
        status: 'pending'
    };

    const feedbackFile = path.join(feedbackDir, `${timestamp}_feedback.json`);
    fs.writeFileSync(feedbackFile, JSON.stringify(feedbackData, null, 2));

    // Create signal file for Douglas to pick up
    const signalFile = path.join(baseDir, 'FEEDBACK_SIGNAL.txt');
    fs.writeFileSync(signalFile, `FEEDBACK PENDENTE\nJobID: ${jobId || file}\nTexto: ${text || feedback}\nTimestamp: ${new Date().toISOString()}`);

    // Notify Douglas via OpenClaw Wake
    const notifyData = {
        jobId: jobId || file,
        mode: mode || 'marketing',
        feedbackAction: action || 'revision',
        feedbackType: type || 'human_feedback',
        feedbackText: text || feedback
    };
    await notifyDouglas(notifyData);

    log('info', 'feedback_received', { jobId, feedback: text || feedback, mode });
    emitStateUpdate(mode || 'marketing');
    res.json({ success: true, saved: feedbackFile, archived: true });
});

// Get pending feedbacks
app.get('/api/feedback', (req, res) => {
    const mode = req.query.mode || 'marketing';
    const baseDir = mode === 'projetos' ? PROJETOS_ROOT : MARKETING_ROOT;
    const feedbackDir = path.join(baseDir, 'feedback');

    if (!fs.existsSync(feedbackDir)) {
        return res.json({ pending: [] });
    }

    const files = fs.readdirSync(feedbackDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            const content = JSON.parse(fs.readFileSync(path.join(feedbackDir, f), 'utf-8'));
            return { filename: f, ...content };
        })
        .filter(f => f.status === 'pending');

    res.json({ pending: files });
});

// Approval endpoint (from War Room UI)
app.post('/api/approve', async (req, res) => {
    const { jobId, mode, timestamp } = req.body;
    const ts = Date.now();

    const baseDir = mode === 'projetos' ? PROJETOS_ROOT : MARKETING_ROOT;
    const approvalDir = path.join(baseDir, 'approved');
    const wipDir = path.join(baseDir, 'wip');
    const doneDir = path.join(baseDir, 'done');

    if (!fs.existsSync(approvalDir)) fs.mkdirSync(approvalDir, { recursive: true });
    if (!fs.existsSync(doneDir)) fs.mkdirSync(doneDir, { recursive: true });

    // Move all project files from wip/ to done/
    const movedFiles = [];
    if (fs.existsSync(wipDir)) {
        const files = fs.readdirSync(wipDir).filter(f => f.startsWith(jobId));
        files.forEach(file => {
            const srcPath = path.join(wipDir, file);
            const destPath = path.join(doneDir, file);
            fs.renameSync(srcPath, destPath);
            movedFiles.push(file);
        });
    }

    const approval = {
        timestamp: timestamp || new Date().toISOString(),
        jobId,
        mode,
        status: 'approved',
        approvedBy: 'human',
        filesMovedToDone: movedFiles.length
    };

    const approvalFile = path.join(approvalDir, `${jobId}_APPROVED_${ts}.json`);
    fs.writeFileSync(approvalFile, JSON.stringify(approval, null, 2));

    log('info', 'campaign_approved', { jobId, mode, filesMoved: movedFiles.length });
    emitStateUpdate(mode || 'marketing');
    res.json({ success: true, saved: approvalFile, filesMoved: movedFiles.length });
});

// ============================================
// REVISION SYSTEM
// ============================================

// Helper: find a file in dir matching jobId + suffix
function findFileByPattern(dir, jobId, suffix) {
    if (!fs.existsSync(dir)) return null;
    const files = fs.readdirSync(dir);
    const match = files.find(f => f.includes(jobId) && f.endsWith(suffix));
    if (!match) return null;
    const fullPath = path.join(dir, match);
    return {
        name: match,
        content: fs.readFileSync(fullPath, 'utf-8'),
        mtime: fs.statSync(fullPath).mtime.toISOString()
    };
}

// Helper: get feedbacks for a specific job
function getFeedbacksForJob(feedbackDir, jobId) {
    if (!fs.existsSync(feedbackDir)) return [];
    return fs.readdirSync(feedbackDir)
        .filter(f => f.endsWith('.json'))
        .map(f => {
            try {
                return { filename: f, ...JSON.parse(fs.readFileSync(path.join(feedbackDir, f), 'utf-8')) };
            } catch(e) { return null; }
        })
        .filter(f => f && (f.jobId === jobId || (f.jobId && f.jobId.startsWith(jobId)) || (f.file && f.file.includes(jobId))));
}

// Helper: get all revisions for a mode (scans wip for _revision_diff.json)
function getRevisions(mode) {
    const root = getModeRoot(mode);
    const wipDir = path.join(root, 'wip');
    if (!fs.existsSync(wipDir)) return [];

    return fs.readdirSync(wipDir)
        .filter(f => f.endsWith('_revision_diff.json'))
        .map(f => {
            try {
                const content = JSON.parse(fs.readFileSync(path.join(wipDir, f), 'utf-8'));
                return { filename: f, ...content };
            } catch(e) {
                return { filename: f, status: 'error' };
            }
        });
}

// API: Get revision data for a specific job
app.get('/api/revisions/:jobId', (req, res) => {
    const { jobId } = req.params;
    const mode = req.query.mode || 'marketing';
    const root = getModeRoot(mode);
    const wipDir = path.join(root, 'wip');
    const doneDir = path.join(root, 'done');
    const feedbackDir = path.join(root, 'feedback');

    // Search in wip first, then done
    const searchDirs = [wipDir, doneDir].filter(d => fs.existsSync(d));

    let original = null, revision = null, diffFile = null;
    for (const dir of searchDirs) {
        if (!original) original = findFileByPattern(dir, jobId, 'FINAL.md');
        if (!revision) revision = findFileByPattern(dir, jobId, 'FINAL_v2.md');
        if (!diffFile) diffFile = findFileByPattern(dir, jobId, 'revision_diff.json');
    }

    const feedbacks = getFeedbacksForJob(feedbackDir, jobId);
    let diffData = null;
    if (diffFile) {
        try { diffData = JSON.parse(diffFile.content); } catch(e) { /* ignore */ }
    }

    res.json({
        jobId,
        mode,
        hasRevision: !!(revision || diffFile),
        original: original ? { name: original.name, content: original.content } : null,
        revision: revision ? { name: revision.name, content: revision.content } : null,
        diff: diffData,
        feedbacks: feedbacks.map(f => ({
            filename: f.filename,
            text: f.text || f.feedback,
            timestamp: f.timestamp,
            status: f.status
        }))
    });
});

// API: Approve revision (V2 becomes the official FINAL)
app.post('/api/revisions/:jobId/approve', (req, res) => {
    const { jobId } = req.params;
    const { mode } = req.body;
    const root = getModeRoot(mode || 'marketing');
    const wipDir = path.join(root, 'wip');

    const originalFile = findFileByPattern(wipDir, jobId, 'FINAL.md');
    const v2File = findFileByPattern(wipDir, jobId, 'FINAL_v2.md');
    const diffFile = findFileByPattern(wipDir, jobId, 'revision_diff.json');

    if (!originalFile || !v2File) {
        return res.status(404).json({ error: 'Original ou revisão não encontrados' });
    }

    try {
        const originalPath = path.join(wipDir, originalFile.name);
        const v2Path = path.join(wipDir, v2File.name);

        // Backup original: _FINAL.md → _FINAL_v1_original.md
        const backupName = originalFile.name.replace('_FINAL.md', '_FINAL_v1_original.md');
        fs.renameSync(originalPath, path.join(wipDir, backupName));

        // Promote V2: _FINAL_v2.md → _FINAL.md
        fs.renameSync(v2Path, originalPath);

        // Update diff status
        if (diffFile) {
            const diffPath = path.join(wipDir, diffFile.name);
            const diffData = JSON.parse(diffFile.content);
            diffData.status = 'approved';
            diffData.approved_at = new Date().toISOString();
            fs.writeFileSync(diffPath, JSON.stringify(diffData, null, 2));
        }

        // Mark feedbacks as resolved
        const feedbackDir = path.join(root, 'feedback');
        const feedbacks = getFeedbacksForJob(feedbackDir, jobId);
        feedbacks.forEach(fb => {
            if (fb.filename) {
                const fbPath = path.join(feedbackDir, fb.filename);
                if (fs.existsSync(fbPath)) {
                    const fbData = JSON.parse(fs.readFileSync(fbPath, 'utf-8'));
                    fbData.status = 'resolved';
                    fbData.resolved_at = new Date().toISOString();
                    fs.writeFileSync(fbPath, JSON.stringify(fbData, null, 2));
                }
            }
        });

        log('info', 'revision_approved', { jobId, mode: mode || 'marketing', backup: backupName });
        emitStateUpdate(mode || 'marketing');
        res.json({ success: true, backup: backupName });
    } catch(err) {
        log('error', 'revision_approve_failed', { jobId, error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// API: Reject revision (keep original, archive feedback)
app.post('/api/revisions/:jobId/reject', (req, res) => {
    const { jobId } = req.params;
    const { mode } = req.body;
    const root = getModeRoot(mode || 'marketing');
    const wipDir = path.join(root, 'wip');
    const feedbackDir = path.join(root, 'feedback');
    const archivedDir = path.join(feedbackDir, 'archived');

    if (!fs.existsSync(archivedDir)) fs.mkdirSync(archivedDir, { recursive: true });

    const v2File = findFileByPattern(wipDir, jobId, 'FINAL_v2.md');
    const diffFile = findFileByPattern(wipDir, jobId, 'revision_diff.json');

    try {
        // Delete V2
        if (v2File) {
            fs.unlinkSync(path.join(wipDir, v2File.name));
        }

        // Update diff status
        if (diffFile) {
            const diffPath = path.join(wipDir, diffFile.name);
            const diffData = JSON.parse(diffFile.content);
            diffData.status = 'rejected';
            diffData.rejected_at = new Date().toISOString();
            fs.writeFileSync(diffPath, JSON.stringify(diffData, null, 2));
        }

        // Archive related feedbacks
        const feedbacks = getFeedbacksForJob(feedbackDir, jobId);
        feedbacks.forEach(fb => {
            if (fb.filename) {
                const src = path.join(feedbackDir, fb.filename);
                const dest = path.join(archivedDir, fb.filename);
                if (fs.existsSync(src)) {
                    fs.renameSync(src, dest);
                }
            }
        });

        log('info', 'revision_rejected', { jobId, mode: mode || 'marketing' });
        emitStateUpdate(mode || 'marketing');
        res.json({ success: true });
    } catch(err) {
        log('error', 'revision_reject_failed', { jobId, error: err.message });
        res.status(500).json({ error: err.message });
    }
});

// Graceful shutdown handler (Railway sends SIGTERM)
let server;
const gracefulShutdown = (signal) => {
    if (gracefulShutdown.isShuttingDown) return;
    gracefulShutdown.isShuttingDown = true;
    log('info', 'shutdown_signal_received', { signal });
    console.log(`\n⚠️ ${signal} received, shutting down gracefully...`);

    // Save metrics before shutdown
    saveMetrics();

    if (server) {
        server.close(() => {
            log('info', 'server_closed');
            console.log('✅ Server closed');
            process.exit(0);
        });

        // Force close after 10s
        const shutdownTimeout = setTimeout(() => {
            log('warn', 'forced_shutdown');
            console.log('⚠️ Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
        shutdownTimeout.unref();
    } else {
        process.exit(0);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Error handlers - prevent silent crashes
process.on('uncaughtException', (err) => {
    log('error', 'uncaught_exception', { error: err.message, stack: err.stack });
    console.error('❌ Uncaught Exception:', err);
    // Sync-only cleanup - process is in unstable state after uncaught exception
    try {
        saveMetrics();
        log('info', 'metrics_saved_on_uncaught_exception');
    } catch (saveErr) {
        log('error', 'metrics_save_failed_on_uncaught_exception', { error: saveErr.message });
    }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log('error', 'unhandled_rejection', { reason: String(reason) });
    console.error('❌ Unhandled Rejection:', reason);
    // Don't exit on unhandled rejection, just log it
});

// Start server - bind to 0.0.0.0 for Railway/Docker compatibility
server = httpServer.listen(PORT, '0.0.0.0', () => {
    log('info', 'server_started', { port: PORT, host: '0.0.0.0', marketingRoot: MARKETING_ROOT, websocket: true });
    console.log(`🚀 Brick AI War Room running on http://0.0.0.0:${PORT}`);
    console.log(`🔌 WebSocket enabled`);
    console.log(`📁 Marketing folder: ${MARKETING_ROOT}`);
});
