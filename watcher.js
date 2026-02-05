/**
 * BRICK AI WATCHER v3.0 (Executor Mode)
 * 
 * - Monitora Railway (API)
 * - Baixa briefings de Marketing, Projetos e Ideias
 * - Executa Maestro (Python) com o pipeline correto
 * - Sincroniza resultados (WIP/DONE) de volta para o Railway
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

// Config
const RAILWAY_URL = process.env.RAILWAY_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'brick-squad-2026';
const POLL_INTERVAL = 10000; // 10s
const PROJECT_ROOT = __dirname;
const MAESTRO_SCRIPT = path.join(PROJECT_ROOT, 'run-pipeline.sh');

// State
const STATE_FILE = path.join(__dirname, '.watcher_state_v3.json');
let processedBriefings = new Set();
let syncedFiles = new Set();
let activeJobs = new Set();

// Mapeamento Modo -> Pipeline YAML
const PIPELINES = {
    'marketing': 'pipelines/standard_v1.yaml',
    'projetos': 'pipelines/projects_v1.yaml',
    'ideias': 'pipelines/ideias_v1.yaml'
};

// Logging
const log = (level, event, data = {}) => {
    console.log(JSON.stringify({ level, event, ...data, timestamp: new Date().toISOString() }));
};

// Sleep
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Persistence
function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            processedBriefings = new Set(data.processedBriefings || []);
            syncedFiles = new Set(data.syncedFiles || []);
        }
    } catch (e) { log('warn', 'state_load_failed', { error: e.message }); }
}

function saveState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({
            processedBriefings: [...processedBriefings],
            syncedFiles: [...syncedFiles],
            lastUpdate: new Date().toISOString()
        }, null, 2));
    } catch (e) { log('error', 'state_save_failed', { error: e.message }); }
}

// Fetch helper
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

// Executar Pipeline
function runPipeline(briefingPath, mode) {
    const pipelineYaml = PIPELINES[mode] || PIPELINES['marketing'];
    const yamlPath = path.join(PROJECT_ROOT, pipelineYaml);
    
    log('info', 'starting_pipeline', { mode, briefing: path.basename(briefingPath), yaml: pipelineYaml });
    
    // Spawn run-pipeline.sh
    const child = spawn(MAESTRO_SCRIPT, [briefingPath, '--pipeline', yamlPath], {
        cwd: PROJECT_ROOT,
        stdio: 'inherit' // Loga direto no console do watcher
    });

    const jobId = path.basename(briefingPath);
    activeJobs.add(jobId);

    child.on('close', (code) => {
        activeJobs.delete(jobId);
        if (code === 0) {
            log('success', 'pipeline_finished', { mode, briefing: path.basename(briefingPath) });
            // Forçar sync imediato após sucesso
            syncLocalToRemote(mode);
        } else {
            log('error', 'pipeline_failed', { mode, briefing: path.basename(briefingPath), code });
        }
    });
}

// Download Briefings
async function checkBriefings(mode) {
    const data = await apiFetch(`/api/pending?mode=${mode}`);
    if (!data || !data.briefings) return;

    for (const b of data.briefings) {
        if (!processedBriefings.has(b.name)) {
            log('info', 'new_briefing_found', { mode, name: b.name });
            
            // Salvar localmente
            const localDir = path.join(PROJECT_ROOT, 'history', mode, 'briefing');
            if (!fs.existsSync(localDir)) fs.mkdirSync(localDir, { recursive: true });
            
            const localPath = path.join(localDir, b.name);
            fs.writeFileSync(localPath, b.content);
            
            // Executar
            runPipeline(localPath, mode);
            
            processedBriefings.add(b.name);
            saveState();
        }
    }
}

// Sync Results (WIP/DONE) -> Railway
async function syncLocalToRemote(mode) {
    const dirs = ['wip', 'done'];
    
    for (const dir of dirs) {
        const localPath = path.join(PROJECT_ROOT, 'history', mode, dir);
        if (!fs.existsSync(localPath)) continue;
        
        const files = fs.readdirSync(localPath).filter(f => !f.startsWith('.'));
        
        for (const file of files) {
            const filePath = path.join(localPath, file);
            const stats = fs.statSync(filePath);
            const fileKey = `${mode}:${dir}:${file}:${stats.mtimeMs}`; // Key inclui mtime pra detectar updates
            
            if (!syncedFiles.has(fileKey)) {
                log('info', 'syncing_file', { mode, dir, file });
                
                const content = fs.readFileSync(filePath, 'utf-8');
                const res = await apiFetch('/api/result', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        filename: file,
                        content,
                        category: dir,
                        mode: mode
                    })
                });
                
                if (res && res.success) {
                    syncedFiles.add(fileKey);
                    saveState();
                }
            }
        }
    }
}

// Main Loop
async function poll() {
    const modes = ['marketing', 'projetos', 'ideias'];
    
    for (const mode of modes) {
        await checkBriefings(mode);
        await syncLocalToRemote(mode);
    }
}

// Init
console.log('🚀 Brick AI Watcher v3.0 (Executor)');
console.log(`📡 Remote: ${RAILWAY_URL}`);
loadState();
poll(); // Run once immediately
setInterval(poll, POLL_INTERVAL);
