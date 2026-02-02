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

// Ensure directories exist
['briefing', 'wip', 'done'].forEach(dir => {
    const dirPath = path.join(MARKETING_ROOT, dir);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

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

// API: Create Briefing (from dashboard)
app.post('/api/briefing', (req, res) => {
    const { title, content } = req.body;
    const filename = `${Date.now()}_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    const filePath = path.join(MARKETING_ROOT, 'briefing', filename);
    
    const fileContent = `# BRIEFING: ${title}\n**Date:** ${new Date().toISOString()}\n**Status:** PENDING\n\n${content}`;
    fs.writeFileSync(filePath, fileContent);
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

app.listen(PORT, () => {
    console.log(`🚀 Brick AI War Room running on port ${PORT}`);
    console.log(`📁 Marketing folder: ${MARKETING_ROOT}`);
});
