const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const bodyParser = require('body-parser');

const app = express();
const PORT = 3000;
const WORKSPACE_ROOT = path.join(__dirname, '..');
const MARKETING_ROOT = path.join(WORKSPACE_ROOT, 'marketing');

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(path.join(__dirname, 'public')));

// Ensure directories exist
['briefing', 'wip', 'done'].forEach(dir => {
    const dirPath = path.join(MARKETING_ROOT, dir);
    if (!fs.existsSync(dirPath)) fs.mkdirSync(dirPath, { recursive: true });
});

// Helper to read directory
const getFiles = (dir) => {
    const dirPath = path.join(MARKETING_ROOT, dir);
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath).filter(f => !f.startsWith('.')).map(f => ({
        name: f,
        path: path.join(dir, f),
        content: fs.readFileSync(path.join(dirPath, f), 'utf-8')
    }));
};

// API: Get all state
app.get('/api/state', (req, res) => {
    res.json({
        briefing: getFiles('briefing'),
        wip: getFiles('wip'),
        done: getFiles('done')
    });
});

// API: Create Briefing
app.post('/api/briefing', (req, res) => {
    const { title, content } = req.body;
    const filename = `${Date.now()}_${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`;
    const filePath = path.join(MARKETING_ROOT, 'briefing', filename);
    
    const fileContent = `# BRIEFING: ${title}\n**Date:** ${new Date().toISOString()}\n\n${content}`;
    fs.writeFileSync(filePath, fileContent);
    res.json({ success: true, filename });
});

// API: Move File (Approve/Reject)
app.post('/api/move', (req, res) => {
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
app.delete('/api/file', (req, res) => {
    const { category, filename } = req.body;
    const filePath = path.join(MARKETING_ROOT, category, filename);
    if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        res.json({ success: true });
    } else {
        res.status(404).json({ error: 'File not found' });
    }
});

app.listen(PORT, () => {
    console.log(`Brick AI War Room running on port ${PORT}`);
});
