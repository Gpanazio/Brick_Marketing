const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');
const rateLimit = require('express-rate-limit');

// Config e Contratos
const CONFIG = require('./config/constants');
const schemas = require('./contracts/schemas');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'brick-squad-2026';

// Trust Proxy (Railway/Load Balancer support)
app.set('trust proxy', 1);

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

// Paths
const MARKETING_ROOT = path.join(__dirname, 'marketing');
const PROJETOS_ROOT = path.join(__dirname, 'projetos');
const HISTORY_ROOT = process.env.HISTORY_PATH || path.join(__dirname, 'history');

// Helper to get root by mode
const getModeRoot = (mode) => {
    if (mode === 'projetos') return PROJETOS_ROOT;
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
['briefing', 'wip', 'done', 'failed'].forEach(dir => {
    const dirPath = path.join(MARKETING_ROOT, dir);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});
if (!fs.existsSync(HISTORY_ROOT)) fs.mkdirSync(HISTORY_ROOT, { recursive: true });

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
    
    // For Write operations (POST/DELETE), require API Key
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
    return fs.readdirSync(dirPath).filter(f => !f.startsWith('.')).map(f => ({
        name: f,
        path: path.join(dir, f),
        content: fs.readFileSync(path.join(dirPath, f), 'utf-8'),
        mtime: fs.statSync(path.join(dirPath, f)).mtime.toISOString()
    }));
};

// API: Health check
app.get('/api/health', (req, res) => {
    res.json({ status: 'online', timestamp: new Date().toISOString() });
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

// API: Get all state (including failed)
app.get('/api/state', (req, res) => {
    const mode = req.query.mode || 'marketing';
    res.json({
        mode,
        briefing: getFiles('briefing', mode),
        wip: getFiles('wip', mode),
        done: getFiles('done', mode),
        failed: getFiles('failed', mode)
    });
});

// API: Get pending briefings (for watcher)
app.get('/api/pending', (req, res) => {
    const mode = req.query.mode || 'marketing';
    res.json({ briefings: getFiles('briefing', mode) });
});

// Telegram notification
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

// API: Create Briefing (from dashboard)
app.post('/api/briefing', async (req, res) => {
    const { title, content, mode } = req.body;
    const root = getModeRoot(mode || 'marketing');
    const filename = `${Date.now()}_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    const filePath = path.join(root, 'briefing', filename);
    
    // Ensure briefing dir exists for this mode
    const briefingDir = path.join(root, 'briefing');
    if (!fs.existsSync(briefingDir)) fs.mkdirSync(briefingDir, { recursive: true });
    
    const modeLabel = mode === 'projetos' ? 'PROJETO' : 'BRIEFING';
    const fileContent = `# ${modeLabel}: ${title}\n**Date:** ${new Date().toISOString()}\n**Status:** PENDING\n**Mode:** ${mode || 'marketing'}\n\n${content}`;
    fs.writeFileSync(filePath, fileContent);
    
    log('info', 'briefing_created', { filename, title, mode: mode || 'marketing' });
    
    // Notify Douglas via Telegram
    const emoji = mode === 'projetos' ? '🎬' : '🚨';
    const typeLabel = mode === 'projetos' ? 'NOVO PROJETO DE CLIENTE' : 'NOVO BRIEFING';
    await notifyTelegram(`${emoji} *${typeLabel} NO WAR ROOM*\n\n*Título:* ${title}\n\n_Douglas, aciona o squad!_`);
    
    res.json({ success: true, filename, mode: mode || 'marketing' });
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
    
    // Validar output do bot se especificado
    if (botName && schemas[botName]) {
        try {
            const jsonMatch = content.match(/```json\n([\s\S]*?)\n```/) || 
                              content.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
                const validation = schemas[botName].validate(parsed);
                if (!validation.valid) {
                    log('warn', 'schema_validation_failed', { botName, error: validation.error });
                }
            }
        } catch (e) {
            log('warn', 'schema_parse_failed', { botName, error: e.message });
        }
    }
    
    if (botName && durationMs) {
        trackStep(botName, true, durationMs, model);
    }
    
    fs.writeFileSync(filePath, content);
    log('info', 'result_submitted', { filename, category: targetCategory, botName, mode: mode || 'marketing' });
    metrics.requests.total++;
    metrics.requests.success++;
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

// API: Archive to history
app.post('/api/archive', (req, res) => {
    const { filename } = req.body;
    const src = path.join(MARKETING_ROOT, 'done', filename);
    const timestamp = new Date().toISOString().split('T')[0];
    const destFilename = `${timestamp}_${filename}`;
    const dest = path.join(HISTORY_ROOT, destFilename);
    
    if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
        log('info', 'file_archived', { filename, archived: destFilename });
        res.json({ success: true, archived: destFilename });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

app.listen(PORT, () => {
    log('info', 'server_started', { port: PORT, marketingRoot: MARKETING_ROOT });
    console.log(`🚀 Brick AI War Room running on port ${PORT}`);
    console.log(`📁 Marketing folder: ${MARKETING_ROOT}`);
});
