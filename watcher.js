/**
 * BRICK AI WATCHER v5.0 (Bash Executor + Cleanup + Metrics)
 * 
 * Melhorias v5.0:
 * - Cleanup automático de state antigo (7 dias)
 * - Métricas de pipeline consolidadas
 * - Logs melhorados com contexto
 * - Health check periódico
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// ============================================
// CONFIGURAÇÃO
// ============================================
const RAILWAY_URL = process.env.RAILWAY_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'brick-squad-2026';
const POLL_INTERVAL = 10000;          // 10s entre polls
const CLEANUP_INTERVAL = 3600000;     // 1h entre cleanups
const STATE_MAX_AGE_DAYS = 7;         // Manter state por 7 dias
const PROJECT_ROOT = __dirname;
const DISPATCHER_SCRIPT = path.join(PROJECT_ROOT, 'run-pipeline.sh');

const STATE_FILE = path.join(__dirname, '.watcher_state_v5.json');
const METRICS_FILE = path.join(__dirname, '.watcher_metrics.json');

// ============================================
// STATE
// ============================================
let processedBriefings = {}; // { name: { mtime, processedAt } }
let syncedFiles = new Set();
let activeJobs = new Set();
let metrics = {
    startTime: new Date().toISOString(),
    totalPipelinesRun: 0,
    successfulPipelines: 0,
    failedPipelines: 0,
    filesSynced: 0,
    lastCleanup: null,
    byMode: {
        marketing: { runs: 0, success: 0, failed: 0 },
        projetos: { runs: 0, success: 0, failed: 0 },
        ideias: { runs: 0, success: 0, failed: 0 }
    }
};

// ============================================
// LOGGING
// ============================================
const log = (level, event, data = {}) => {
    const entry = {
        level,
        event,
        ...data,
        timestamp: new Date().toISOString(),
        activeJobs: activeJobs.size
    };
    console.log(JSON.stringify(entry));
};

// ============================================
// STATE MANAGEMENT
// ============================================
function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));

            // Migration: handle old format
            if (Array.isArray(data.processedBriefings)) {
                processedBriefings = {};
                data.processedBriefings.forEach(name => {
                    processedBriefings[name] = { mtime: '0', processedAt: new Date().toISOString() };
                });
            } else if (typeof data.processedBriefings === 'object') {
                // Migration: handle v4 format (just mtime string)
                processedBriefings = {};
                for (const [name, value] of Object.entries(data.processedBriefings)) {
                    if (typeof value === 'string') {
                        processedBriefings[name] = { mtime: value, processedAt: new Date().toISOString() };
                    } else {
                        processedBriefings[name] = value;
                    }
                }
            }

            syncedFiles = new Set(data.syncedFiles || []);
        }

        // Load metrics
        if (fs.existsSync(METRICS_FILE)) {
            const savedMetrics = JSON.parse(fs.readFileSync(METRICS_FILE, 'utf-8'));
            metrics = { ...metrics, ...savedMetrics, startTime: new Date().toISOString() };
        }

        log('info', 'state_loaded', {
            briefingsCount: Object.keys(processedBriefings).length,
            syncedFilesCount: syncedFiles.size
        });
    } catch (e) {
        log('error', 'state_load_failed', { error: e.message });
    }
}

function saveState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({
            processedBriefings,
            syncedFiles: [...syncedFiles],
            lastUpdate: new Date().toISOString()
        }, null, 2));
    } catch (e) {
        log('error', 'state_save_failed', { error: e.message });
    }
}

function saveMetrics() {
    try {
        fs.writeFileSync(METRICS_FILE, JSON.stringify(metrics, null, 2));
    } catch (e) { }
}

// ============================================
// CLEANUP DE STATE ANTIGO
// ============================================
function cleanupOldState() {
    const now = Date.now();
    const maxAge = STATE_MAX_AGE_DAYS * 24 * 60 * 60 * 1000;
    let cleanedBriefings = 0;
    let cleanedFiles = 0;

    // Limpar briefings antigos
    for (const [name, data] of Object.entries(processedBriefings)) {
        const processedAt = data.processedAt ? new Date(data.processedAt).getTime() : 0;
        if (now - processedAt > maxAge) {
            delete processedBriefings[name];
            cleanedBriefings++;
        }
    }

    // Limpar synced files antigos (baseado no mtime no key)
    const newSyncedFiles = new Set();
    for (const key of syncedFiles) {
        const parts = key.split(':');
        const mtimeMs = parseInt(parts[3]) || 0;
        if (now - mtimeMs < maxAge) {
            newSyncedFiles.add(key);
        } else {
            cleanedFiles++;
        }
    }
    syncedFiles = newSyncedFiles;

    if (cleanedBriefings > 0 || cleanedFiles > 0) {
        log('info', 'cleanup_completed', { cleanedBriefings, cleanedFiles });
        saveState();
    }

    metrics.lastCleanup = new Date().toISOString();
    saveMetrics();
}

// ============================================
// API
// ============================================
async function apiFetch(endpoint, options = {}) {
    try {
        const url = `${RAILWAY_URL}${endpoint}`;
        const headers = { 'X-API-Key': API_KEY, ...options.headers };
        const res = await fetch(url, { ...options, headers });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        log('error', 'api_fetch_failed', { endpoint, error: e.message });
        return null;
    }
}

// Health check
async function healthCheck() {
    const result = await apiFetch('/api/health');
    if (result) {
        log('debug', 'health_check_ok', { remote: RAILWAY_URL });
        return true;
    }
    log('warn', 'health_check_failed', { remote: RAILWAY_URL });
    return false;
}

// ============================================
// PIPELINE EXECUTION
// ============================================
function runPipeline(briefingPath, mode) {
    const briefingName = path.basename(briefingPath);
    log('info', 'starting_pipeline', { mode, briefing: briefingName });

    const startTime = Date.now();
    const args = [briefingPath, `--mode=${mode}`];

    const child = spawn(DISPATCHER_SCRIPT, args, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit'
    });

    const jobId = briefingName;
    activeJobs.add(jobId);
    metrics.totalPipelinesRun++;
    metrics.byMode[mode].runs++;

    child.on('close', (code) => {
        activeJobs.delete(jobId);
        const duration = Date.now() - startTime;

        if (code === 0) {
            metrics.successfulPipelines++;
            metrics.byMode[mode].success++;
            log('success', 'pipeline_finished', {
                mode,
                briefing: briefingName,
                durationMs: duration
            });
            syncLocalToRemote(mode);
        } else {
            metrics.failedPipelines++;
            metrics.byMode[mode].failed++;
            log('error', 'pipeline_failed', {
                mode,
                briefing: briefingName,
                code,
                durationMs: duration
            });
        }

        saveMetrics();
    });
}

// ============================================
// BRIEFING CHECK
// ============================================
async function checkBriefings(mode) {
    const data = await apiFetch(`/api/pending?mode=${mode}`);
    if (!data || !data.briefings) return;

    for (const b of data.briefings) {
        const existing = processedBriefings[b.name];
        const lastMtime = existing?.mtime;
        const currentMtime = b.mtime || '0';

        // Process if: never seen, OR mtime changed (re-run touched it)
        if (!lastMtime || lastMtime !== currentMtime) {
            const isRerun = !!lastMtime;
            log('info', isRerun ? 'rerun_detected' : 'new_briefing_found', {
                mode,
                name: b.name,
                mtime: currentMtime
            });

            // Skip if already running this briefing
            if (activeJobs.has(b.name)) {
                log('info', 'skipping_active_job', { name: b.name });
                continue;
            }

            const localDir = path.join(PROJECT_ROOT, 'history', mode, 'briefing');
            if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });

            const localPath = path.join(localDir, b.name);
            fs.writeFileSync(localPath, b.content);

            runPipeline(localPath, mode);

            processedBriefings[b.name] = {
                mtime: currentMtime,
                processedAt: new Date().toISOString()
            };
            saveState();
        }
    }
}

// ============================================
// SYNC LOCAL -> REMOTE
// ============================================
async function syncLocalToRemote(mode) {
    const dirs = ['wip', 'done'];
    for (const dir of dirs) {
        const localPath = path.join(PROJECT_ROOT, 'history', mode, dir);
        if (!fs.existsSync(localPath)) continue;

        const files = fs.readdirSync(localPath).filter(f => !f.startsWith('.') && !f.startsWith('logs'));
        for (const file of files) {
            const filePath = path.join(localPath, file);

            // Skip directories (like logs/)
            const stats = fs.statSync(filePath);
            if (stats.isDirectory()) continue;

            const fileKey = `${mode}:${dir}:${file}:${stats.mtimeMs}`;

            if (!syncedFiles.has(fileKey)) {
                log('info', 'syncing_file', { mode, dir, file });
                const content = fs.readFileSync(filePath, 'utf-8');
                const res = await apiFetch('/api/result', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ filename: file, content, category: dir, mode: mode })
                });
                if (res && res.success) {
                    syncedFiles.add(fileKey);
                    metrics.filesSynced++;
                    saveState();
                }
            }
        }
    }
}

// ============================================
// POLL LOOP
// ============================================
async function poll() {
    const modes = ['marketing', 'projetos', 'ideias'];
    for (const mode of modes) {
        await checkBriefings(mode);
        await syncLocalToRemote(mode);
    }
}

// ============================================
// STARTUP
// ============================================
console.log('🚀 Brick AI Watcher v5.0 (Cleanup + Metrics)');
console.log(`📡 Remote: ${RAILWAY_URL}`);
console.log(`🧹 Cleanup interval: ${CLEANUP_INTERVAL / 60000} min`);
console.log(`📊 State max age: ${STATE_MAX_AGE_DAYS} days`);

loadState();

// Initial health check
healthCheck().then(healthy => {
    if (healthy) {
        log('info', 'watcher_started', { version: '5.0' });
    } else {
        log('warn', 'watcher_started_degraded', { version: '5.0', reason: 'Remote unreachable' });
    }
});

// Start polling
poll();
setInterval(poll, POLL_INTERVAL);

// Start cleanup job
cleanupOldState();
setInterval(cleanupOldState, CLEANUP_INTERVAL);

// Graceful shutdown
process.on('SIGTERM', () => {
    log('info', 'watcher_shutdown', { reason: 'SIGTERM' });
    saveState();
    saveMetrics();
    process.exit(0);
});

process.on('SIGINT', () => {
    log('info', 'watcher_shutdown', { reason: 'SIGINT' });
    saveState();
    saveMetrics();
    process.exit(0);
});
