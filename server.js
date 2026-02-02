const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'brick-squad-2026';

// Paths - use local dir in production (Railway)
const MARKETING_ROOT = path.join(__dirname, 'marketing');

app.use(cors());
app.use(bodyParser.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

// Paths for history (persistent volume on Railway)
const HISTORY_ROOT = process.env.HISTORY_PATH || path.join(__dirname, 'history');

// Ensure directories exist
['briefing', 'wip', 'done'].forEach(dir => {
    const dirPath = path.join(MARKETING_ROOT, dir);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});
if (!fs.existsSync(HISTORY_ROOT)) fs.mkdirSync(HISTORY_ROOT, { recursive: true });

// Simple API Key auth middleware
const authMiddleware = (req, res, next) => {
    const key = req.headers['x-api-key'] || req.query.key;
    if (key === API_KEY || req.method === 'GET') {
        next();
    } else {
        res.status(401).json({ error: 'Unauthorized' });
    }
};

// Helper to read directory
const getFiles = (dir) => {
    const dirPath = path.join(MARKETING_ROOT, dir);
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

// API: Get all state
app.get('/api/state', (req, res) => {
    res.json({
        briefing: getFiles('briefing'),
        wip: getFiles('wip'),
        done: getFiles('done')
    });
});

// API: Get pending briefings (for watcher)
app.get('/api/pending', (req, res) => {
    res.json({ briefings: getFiles('briefing') });
});

// Telegram notification (optional - set TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID in env)
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
    } catch (e) {
        console.error('Telegram notification failed:', e.message);
    }
}

// API: Create Briefing (from dashboard)
app.post('/api/briefing', async (req, res) => {
    const { title, content } = req.body;
    const filename = `${Date.now()}_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    const filePath = path.join(MARKETING_ROOT, 'briefing', filename);
    
    const fileContent = `# BRIEFING: ${title}\n**Date:** ${new Date().toISOString()}\n**Status:** PENDING\n\n${content}`;
    fs.writeFileSync(filePath, fileContent);
    
    // Notify Douglas via Telegram
    await notifyTelegram(`🚨 *NOVO BRIEFING NO WAR ROOM*\n\n*Título:* ${title}\n\n_Douglas, aciona o squad!_`);
    
    res.json({ success: true, filename });
});

// API: Submit result from agent (watcher pushes here)
app.post('/api/result', authMiddleware, (req, res) => {
    const { filename, content, category } = req.body;
    const targetCategory = category || 'wip';
    const filePath = path.join(MARKETING_ROOT, targetCategory, filename);
    
    fs.writeFileSync(filePath, content);
    res.json({ success: true, filename, category: targetCategory });
});

// API: Move File (Approve/Reject)
app.post('/api/move', authMiddleware, (req, res) => {
    const { filename, from, to } = req.body;
    const src = path.join(MARKETING_ROOT, from, filename);
    const dest = path.join(MARKETING_ROOT, to, filename);
    
    if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: Delete File
app.delete('/api/file', authMiddleware, (req, res) => {
    const { category, filename } = req.body;
    const filePath = path.join(MARKETING_ROOT, category, filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

// API: Clear briefing after processing
app.post('/api/briefing/clear', authMiddleware, (req, res) => {
    const { filename } = req.body;
    const filePath = path.join(MARKETING_ROOT, 'briefing', filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
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
    // Sort by date descending
    files.sort((a, b) => new Date(b.mtime) - new Date(a.mtime));
    res.json({ history: files });
});

// API: Squad Architecture (read-only)
app.get('/api/architecture', (req, res) => {
    const filePath = path.join(__dirname, 'SQUAD_ARCHITECTURE.md');
    if (!fs.existsSync(filePath)) {
        return res.status(404).json({ error: 'SQUAD_ARCHITECTURE.md not found' });
    }
    const content = fs.readFileSync(filePath, 'utf-8');
    res.json({ content });
});

// API: Archive to history (move from done to history)
app.post('/api/archive', authMiddleware, (req, res) => {
    const { filename } = req.body;
    const src = path.join(MARKETING_ROOT, 'done', filename);
    const timestamp = new Date().toISOString().split('T')[0];
    const destFilename = `${timestamp}_${filename}`;
    const dest = path.join(HISTORY_ROOT, destFilename);
    
    if (fs.existsSync(src)) {
        fs.renameSync(src, dest);
        res.json({ success: true, archived: destFilename });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 Brick AI War Room running on port ${PORT}`);
    console.log(`📁 Marketing folder: ${MARKETING_ROOT}`);
});
