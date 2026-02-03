/**
 * BRICK AI WATCHER v2.0
 * 
 * Monitora Railway, detecta briefings, notifica Douglas.
 * MELHORIAS: Retry com backoff, persistência de estado, logs estruturados.
 * 
 * Uso: RAILWAY_URL=https://seu-app.up.railway.app node watcher.js
 */

const fs = require('fs');
const path = require('path');

const RAILWAY_URL = process.env.RAILWAY_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'brick-squad-2026';
const POLL_INTERVAL = 10000; // 10 segundos
const LOCAL_MARKETING = path.join(__dirname);
const STATE_FILE = path.join(__dirname, '.watcher_state.json');
const MAX_RETRIES = 3;

let processedBriefings = new Set();
let lastWipFiles = new Set();

// Structured logging
const log = (level, event, data = {}) => {
    const entry = { level, event, ...data, timestamp: new Date().toISOString() };
    console.log(JSON.stringify(entry));
};

// State persistence
function saveState() {
    try {
        fs.writeFileSync(STATE_FILE, JSON.stringify({
            processedBriefings: [...processedBriefings],
            lastWipFiles: [...lastWipFiles],
            savedAt: new Date().toISOString()
        }, null, 2));
    } catch (e) {
        log('error', 'state_save_failed', { error: e.message });
    }
}

function loadState() {
    try {
        if (fs.existsSync(STATE_FILE)) {
            const data = JSON.parse(fs.readFileSync(STATE_FILE, 'utf-8'));
            processedBriefings = new Set(data.processedBriefings || []);
            lastWipFiles = new Set(data.lastWipFiles || []);
            log('info', 'state_loaded', { 
                processedBriefings: processedBriefings.size, 
                lastWipFiles: lastWipFiles.size 
            });
        }
    } catch (e) {
        log('warn', 'state_load_failed', { error: e.message });
    }
}

// Sleep helper
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

// Fetch with exponential backoff retry
async function fetchWithRetry(url, options = {}, maxRetries = MAX_RETRIES) {
    let lastError;
    
    for (let i = 0; i < maxRetries; i++) {
        try {
            const res = await fetch(url, options);
            if (res.ok) return await res.json();
            throw new Error(`HTTP ${res.status}`);
        } catch (e) {
            lastError = e;
            if (i < maxRetries - 1) {
                const delay = Math.pow(2, i) * 1000; // 1s, 2s, 4s
                log('warn', 'fetch_retry', { url, attempt: i + 1, delay, error: e.message });
                await sleep(delay);
            }
        }
    }
    
    log('error', 'fetch_failed', { url, attempts: maxRetries, error: lastError.message });
    return null;
}

console.log('🔗 Brick AI Watcher v2.0 iniciado');
console.log(`📡 Railway: ${RAILWAY_URL}`);
console.log(`📁 Local: ${LOCAL_MARKETING}`);
console.log('---');

// Ensure local dirs exist
['briefing', 'wip', 'done', 'failed'].forEach(dir => {
    const dirPath = path.join(LOCAL_MARKETING, 'marketing', dir);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

// Fetch from Railway
async function fetchState() {
    return await fetchWithRetry(`${RAILWAY_URL}/api/state`);
}

// Send result to Railway with retry
async function sendResult(filename, content, category = 'wip') {
    const result = await fetchWithRetry(`${RAILWAY_URL}/api/result`, {
        method: 'POST',
        headers: { 
            'Content-Type': 'application/json',
            'X-API-Key': API_KEY
        },
        body: JSON.stringify({ filename, content, category })
    });
    
    if (result) {
        log('info', 'result_sent', { filename, category });
        return true;
    }
    return false;
}

// Report failure to Railway
async function reportFailure(filename, step, error) {
    try {
        await fetch(`${RAILWAY_URL}/api/fail`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify({ filename, step, error })
        });
        log('info', 'failure_reported', { filename, step });
    } catch (e) {
        log('error', 'failure_report_failed', { error: e.message });
    }
}

// Clear briefing from Railway after processing
async function clearBriefing(filename) {
    try {
        const res = await fetch(`${RAILWAY_URL}/api/briefing/clear`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify({ filename })
        });
        return res.ok;
    } catch (e) {
        return false;
    }
}

// Check for new briefings
async function checkBriefings(state) {
    for (const briefing of state.briefing) {
        if (!processedBriefings.has(briefing.name)) {
            log('info', 'briefing_detected', { name: briefing.name });
            
            // Save locally for Douglas to process
            const localPath = path.join(LOCAL_MARKETING, 'marketing', 'briefing', briefing.name);
            fs.writeFileSync(localPath, briefing.content);
            
            // Create signal file for Douglas
            const signalPath = path.join(LOCAL_MARKETING, 'NEW_BRIEFING_SIGNAL.txt');
            fs.writeFileSync(signalPath, `NOVO BRIEFING: ${briefing.name}\nDATA: ${new Date().toISOString()}\n\nDouglas, processe este briefing!`);
            
            processedBriefings.add(briefing.name);
            saveState();
            
            log('info', 'briefing_saved_locally', { name: briefing.name });
        }
    }
}

// Check for new local WIP files to sync to Railway
async function syncLocalToRailway() {
    const wipPath = path.join(LOCAL_MARKETING, 'marketing', 'wip');
    if (!fs.existsSync(wipPath)) return;
    
    const localFiles = fs.readdirSync(wipPath).filter(f => !f.startsWith('.'));
    
    for (const file of localFiles) {
        if (!lastWipFiles.has(file)) {
            const content = fs.readFileSync(path.join(wipPath, file), 'utf-8');
            const success = await sendResult(file, content, 'wip');
            if (success) {
                lastWipFiles.add(file);
                saveState();
            }
        }
    }
}

// Main loop
async function poll() {
    const state = await fetchState();
    if (state) {
        await checkBriefings(state);
        await syncLocalToRailway();
    }
}

// Initial sync of existing files
function initialSync() {
    loadState();
    
    const wipPath = path.join(LOCAL_MARKETING, 'marketing', 'wip');
    if (fs.existsSync(wipPath)) {
        const files = fs.readdirSync(wipPath).filter(f => !f.startsWith('.'));
        files.forEach(f => lastWipFiles.add(f));
    }
    saveState();
}

// Graceful shutdown
process.on('SIGINT', () => {
    log('info', 'watcher_stopping');
    saveState();
    process.exit(0);
});

process.on('SIGTERM', () => {
    log('info', 'watcher_stopping');
    saveState();
    process.exit(0);
});

initialSync();
poll();
setInterval(poll, POLL_INTERVAL);

log('info', 'watcher_started', { pollInterval: POLL_INTERVAL, railwayUrl: RAILWAY_URL });
