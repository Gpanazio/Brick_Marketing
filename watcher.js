/**
 * BRICK AI WATCHER
 * 
 * Este script roda LOCAL no Mac e monitora o Railway.
 * Quando detecta um briefing novo, cria um arquivo local para o Douglas processar.
 * Quando o Douglas termina, este script envia o resultado de volta pro Railway.
 * 
 * Uso: RAILWAY_URL=https://seu-app.up.railway.app node watcher.js
 */

const fs = require('fs');
const path = require('path');

const RAILWAY_URL = process.env.RAILWAY_URL || 'http://localhost:3000';
const API_KEY = process.env.API_KEY || 'brick-squad-2026';
const POLL_INTERVAL = 10000; // 10 segundos
const LOCAL_MARKETING = path.join(__dirname);

let processedBriefings = new Set();
let lastWipFiles = new Set();

console.log('🔗 Brick AI Watcher iniciado');
console.log(`📡 Conectando ao Railway: ${RAILWAY_URL}`);
console.log(`📁 Pasta local: ${LOCAL_MARKETING}`);
console.log('---');

// Ensure local dirs exist
['briefing', 'wip', 'done'].forEach(dir => {
    const dirPath = path.join(LOCAL_MARKETING, dir);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

// Fetch from Railway
async function fetchState() {
    try {
        const res = await fetch(`${RAILWAY_URL}/api/state`);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } catch (e) {
        console.error('❌ Erro ao conectar no Railway:', e.message);
        return null;
    }
}

// Send result to Railway
async function sendResult(filename, content, category = 'wip') {
    try {
        const res = await fetch(`${RAILWAY_URL}/api/result`, {
            method: 'POST',
            headers: { 
                'Content-Type': 'application/json',
                'X-API-Key': API_KEY
            },
            body: JSON.stringify({ filename, content, category })
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        console.log(`✅ Enviado pro Railway: ${filename}`);
        return true;
    } catch (e) {
        console.error('❌ Erro ao enviar resultado:', e.message);
        return false;
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
            console.log(`📥 NOVO BRIEFING DETECTADO: ${briefing.name}`);
            
            // Save locally for Douglas to process
            const localPath = path.join(LOCAL_MARKETING, 'briefing', briefing.name);
            fs.writeFileSync(localPath, briefing.content);
            
            // Create signal file for Douglas
            const signalPath = path.join(LOCAL_MARKETING, 'NEW_BRIEFING_SIGNAL.txt');
            fs.writeFileSync(signalPath, `NOVO BRIEFING: ${briefing.name}\nDATA: ${new Date().toISOString()}\n\nDouglas, processe este briefing!`);
            
            processedBriefings.add(briefing.name);
            console.log(`💾 Briefing salvo localmente. Aguardando Douglas processar...`);
        }
    }
}

// Check for new local WIP files to sync to Railway
async function syncLocalToRailway() {
    const wipPath = path.join(LOCAL_MARKETING, 'wip');
    if (!fs.existsSync(wipPath)) return;
    
    const localFiles = fs.readdirSync(wipPath).filter(f => !f.startsWith('.'));
    
    for (const file of localFiles) {
        if (!lastWipFiles.has(file)) {
            const content = fs.readFileSync(path.join(wipPath, file), 'utf-8');
            await sendResult(file, content, 'wip');
            lastWipFiles.add(file);
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
    const wipPath = path.join(LOCAL_MARKETING, 'wip');
    if (fs.existsSync(wipPath)) {
        const files = fs.readdirSync(wipPath).filter(f => !f.startsWith('.'));
        files.forEach(f => lastWipFiles.add(f));
    }
}

initialSync();
poll();
setInterval(poll, POLL_INTERVAL);

console.log(`🔄 Polling a cada ${POLL_INTERVAL/1000}s...`);
