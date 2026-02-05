/**
 * BRICK AI WATCHER v4.0 (Bash Executor)
 * 
 * - Monitora Railway (API)
 * - Executa scripts Bash nativos via Dispatcher
 * - Sincroniza resultados
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const RAILWAY_URL = process.env.RAILWAY_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'brick-squad-2026';
const POLL_INTERVAL = 10000;
const PROJECT_ROOT = __dirname;
const DISPATCHER_SCRIPT = path.join(PROJECT_ROOT, 'run-pipeline.sh');

const STATE_FILE = path.join(__dirname, '.watcher_state_v4.json');
let processedBriefings = {}; // { name: mtime } - tracks mtime to detect re-runs
let syncedFiles = new Set();
let activeJobs = new Set();

const log = (level, event, data = {}) => {
    console.log(JSON.stringify({ level, event, ...data, timestamp: new Date().toISOString() }));
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            // Migration: old format was array, new format is object { name: mtime }
            if (Array.isArray(data.processedBriefings)) {
                processedBriefings = {};
                data.processedBriefings.forEach(name => { processedBriefings[name] = '0'; });
            } else {
                processedBriefings = data.processedBriefings || {};
            }
            syncedFiles = new Set(data.syncedFiles || []);
        }
    } catch (e) {}
}

function saveState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({
            processedBriefings,
            syncedFiles: [...syncedFiles],
            lastUpdate: new Date().toISOString()
        }, null, 2));
    } catch (e) {}
}

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

function runPipeline(briefingPath, mode) {
    log('info', 'starting_pipeline_bash', { mode, briefing: path.basename(briefingPath) });
    
    // Passa o modo como flag para o dispatcher bash pegar
    const args = [briefingPath, `--mode=${mode}`];
    
    const child = spawn(DISPATCHER_SCRIPT, args, {
        cwd: PROJECT_ROOT,
        stdio: 'inherit'
    });

    const jobId = path.basename(briefingPath);
    activeJobs.add(jobId);

    child.on('close', (code) => {
        activeJobs.delete(jobId);
        if (code === 0) {
            log('success', 'pipeline_finished', { mode, briefing: path.basename(briefingPath) });
            syncLocalToRemote(mode);
        } else {
            log('error', 'pipeline_failed', { mode, briefing: path.basename(briefingPath), code });
        }
    });
}

async function checkBriefings(mode) {
    const data = await apiFetch(`/api/pending?mode=${mode}`);
    if (!data || !data.briefings) return;

    for (const b of data.briefings) {
        const lastMtime = processedBriefings[b.name];
        const currentMtime = b.mtime || '0';
        
        // Process if: never seen, OR mtime changed (re-run touched it)
        if (!lastMtime || lastMtime !== currentMtime) {
            const isRerun = !!lastMtime;
            log('info', isRerun ? 'rerun_detected' : 'new_briefing_found', { mode, name: b.name, mtime: currentMtime });
            
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
            
            processedBriefings[b.name] = currentMtime;
            saveState();
        }
    }
}

async function syncLocalToRemote(mode) {
    const dirs = ['wip', 'done'];
    for (const dir of dirs) {
        const localPath = path.join(PROJECT_ROOT, 'history', mode, dir);
        if (!fs.existsSync(localPath)) continue;
        
        const files = fs.readdirSync(localPath).filter(f => !f.startsWith('.'));
        for (const file of files) {
            const filePath = path.join(localPath, file);
            const stats = fs.statSync(filePath);
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
                    saveState();
                }
            }
        }
    }
}

async function poll() {
    const modes = ['marketing', 'projetos', 'ideias'];
    for (const mode of modes) {
        await checkBriefings(mode);
        await syncLocalToRemote(mode);
    }
}

console.log('🚀 Brick AI Watcher v4.0 (Bash Executor)');
console.log(`📡 Remote: ${RAILWAY_URL}`);
loadState();
poll();
setInterval(poll, POLL_INTERVAL);
