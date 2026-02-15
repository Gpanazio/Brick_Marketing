const fs = require('fs');
const path = require('path');

// Paths - Use persistent volume for Railway
const IS_RAILWAY = process.env.RAILWAY_ENVIRONMENT || (process.env.PORT && !process.env.HOME?.includes('gabrielpanazio'));
const HISTORY_ROOT = IS_RAILWAY ? '/api/history' : (process.env.HISTORY_PATH || path.join(__dirname, '..', '..', 'history'));
console.log(`[STARTUP] IS_RAILWAY=${IS_RAILWAY} | HISTORY_ROOT=${HISTORY_ROOT}`);

const MARKETING_ROOT = path.join(HISTORY_ROOT, 'marketing');
const PROJETOS_ROOT = path.join(HISTORY_ROOT, 'projetos');
const IDEIAS_ROOT = path.join(HISTORY_ROOT, 'ideias');
const ORIGINAIS_ROOT = path.join(HISTORY_ROOT, 'originais');

// Helper to get root by mode
const getModeRoot = (mode) => {
    if (mode === 'projetos') return PROJETOS_ROOT;
    if (mode === 'ideias') return IDEIAS_ROOT;
    if (mode === 'originais') return ORIGINAIS_ROOT;
    return MARKETING_ROOT; // default: marketing
};

// Helper to read directory (with full content)
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

// Helper para socket (sem content pra economizar banda)
const getFilesForSocket = (dir, mode) => {
    const root = getModeRoot(mode);
    const dirPath = path.join(root, dir);
    if (!fs.existsSync(dirPath)) return [];
    return fs.readdirSync(dirPath).filter(f => !f.startsWith('.')).map(f => ({
        name: f,
        path: path.join(dir, f),
        mtime: fs.statSync(path.join(dirPath, f)).mtime.toISOString()
    }));
};

// Helper: find a file in dir matching id
function findFile(dir, id) {
    if (!fs.existsSync(dir)) return null;
    return fs.readdirSync(dir).find(f => f.includes(id)) || null;
}

// Helper: find a file in dir matching jobId + suffix (returns object with name, content, mtime)
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
            } catch (e) { return null; }
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
            } catch (e) {
                return { filename: f, status: 'error' };
            }
        });
}

// Ensure directories exist at startup
function ensureDirectories() {
    console.log(`[STARTUP] Creating directories...`);
    try {
        if (!fs.existsSync(HISTORY_ROOT)) {
            console.log(`[STARTUP] Creating HISTORY_ROOT: ${HISTORY_ROOT}`);
            fs.mkdirSync(HISTORY_ROOT, { recursive: true });
        }
        [MARKETING_ROOT, PROJETOS_ROOT, IDEIAS_ROOT, ORIGINAIS_ROOT].forEach(root => {
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
}

module.exports = {
    IS_RAILWAY,
    HISTORY_ROOT,
    MARKETING_ROOT,
    PROJETOS_ROOT,
    IDEIAS_ROOT,
    ORIGINAIS_ROOT,
    getModeRoot,
    getFiles,
    getFilesForSocket,
    findFile,
    findFileByPattern,
    getFeedbacksForJob,
    getRevisions,
    ensureDirectories
};
