const { Pool } = require('pg');
const { log } = require('./logger');

// Use DATABASE_PUBLIC_URL (Railway standard) or DATABASE_URL fallback
const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;

let pool = null;

function getPool() {
    if (!pool) {
        if (!connectionString) {
            console.warn('[DB] No DATABASE_PUBLIC_URL or DATABASE_URL set — database features disabled');
            return null;
        }
        pool = new Pool({
            connectionString,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000,
            ssl: connectionString.includes('railway') ? { rejectUnauthorized: false } : false
        });
        pool.on('error', (err) => {
            log('error', 'db_pool_error', { error: err.message });
            console.error('[DB] Pool error:', err.message);
        });
    }
    return pool;
}

async function query(text, params) {
    const p = getPool();
    if (!p) throw new Error('Database not configured');
    return p.query(text, params);
}

async function initDb() {
    const p = getPool();
    if (!p) {
        console.log('[DB] Skipped — no connection string');
        return false;
    }

    try {
        // Test connection
        const res = await p.query('SELECT NOW()');
        console.log(`[DB] ✅ Connected at ${res.rows[0].now}`);

        // Create tables
        await p.query(`
            CREATE TABLE IF NOT EXISTS projects (
                id            SERIAL PRIMARY KEY,
                job_id        TEXT NOT NULL,
                mode          TEXT NOT NULL DEFAULT 'marketing',
                title         TEXT,
                status        TEXT NOT NULL DEFAULT 'briefing',
                content       TEXT,
                created_at    TIMESTAMPTZ DEFAULT NOW(),
                updated_at    TIMESTAMPTZ DEFAULT NOW(),
                archived_at   TIMESTAMPTZ,
                deleted_at    TIMESTAMPTZ,
                UNIQUE(job_id, mode)
            );

            CREATE TABLE IF NOT EXISTS pipeline_files (
                id            SERIAL PRIMARY KEY,
                job_id        TEXT NOT NULL,
                mode          TEXT NOT NULL DEFAULT 'marketing',
                category      TEXT NOT NULL,
                filename      TEXT NOT NULL,
                content       TEXT,
                bot_name      TEXT,
                model         TEXT,
                duration_ms   INT,
                created_at    TIMESTAMPTZ DEFAULT NOW(),
                updated_at    TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS feedbacks (
                id            SERIAL PRIMARY KEY,
                job_id        TEXT NOT NULL,
                mode          TEXT NOT NULL DEFAULT 'marketing',
                action        TEXT DEFAULT 'revision',
                type          TEXT DEFAULT 'human_feedback',
                text          TEXT,
                routed_to     TEXT,
                status        TEXT DEFAULT 'pending',
                resolved_at   TIMESTAMPTZ,
                created_at    TIMESTAMPTZ DEFAULT NOW()
            );

            CREATE TABLE IF NOT EXISTS cost_reports (
                id            SERIAL PRIMARY KEY,
                job_id        TEXT NOT NULL,
                mode          TEXT NOT NULL DEFAULT 'marketing',
                report        JSONB NOT NULL,
                total_cost    NUMERIC(10,6),
                total_tokens  INT,
                total_steps   INT,
                completed_at  TIMESTAMPTZ DEFAULT NOW()
            );

            -- Indexes for common queries
            CREATE INDEX IF NOT EXISTS idx_projects_job_mode ON projects(job_id, mode);
            CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(status) WHERE deleted_at IS NULL;
            CREATE INDEX IF NOT EXISTS idx_pipeline_files_job ON pipeline_files(job_id, mode);
            CREATE INDEX IF NOT EXISTS idx_pipeline_files_category ON pipeline_files(category, mode);
            CREATE INDEX IF NOT EXISTS idx_feedbacks_job ON feedbacks(job_id);
            CREATE INDEX IF NOT EXISTS idx_feedbacks_status ON feedbacks(status);
            CREATE INDEX IF NOT EXISTS idx_cost_reports_job ON cost_reports(job_id);
        `);

        console.log('[DB] ✅ Tables and indexes ready');
        log('info', 'db_initialized');
        return true;
    } catch (err) {
        console.error('[DB] ❌ Init failed:', err.message);
        log('error', 'db_init_failed', { error: err.message });
        return false;
    }
}

// Helper: ensure project exists (upsert)
async function ensureProject(jobId, mode, title, status) {
    return query(`
        INSERT INTO projects (job_id, mode, title, status)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (job_id, mode)
        DO UPDATE SET updated_at = NOW(), title = COALESCE(EXCLUDED.title, projects.title),
                      status = COALESCE(EXCLUDED.status, projects.status)
        RETURNING *
    `, [jobId, mode, title || null, status || 'briefing']);
}

// Helper: save/update a pipeline file
async function savePipelineFile(jobId, mode, category, filename, content, botName, model, durationMs) {
    // Upsert by job_id + mode + filename
    return query(`
        INSERT INTO pipeline_files (job_id, mode, category, filename, content, bot_name, model, duration_ms)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
        ON CONFLICT DO NOTHING
        RETURNING *
    `, [jobId, mode, category, filename, content, botName || null, model || null, durationMs || null]);
}

// Helper: get pipeline files for state
async function getFilesByCategory(mode, category) {
    const res = await query(`
        SELECT filename AS name, content, category AS path, updated_at AS mtime
        FROM pipeline_files
        WHERE mode = $1 AND category = $2
        ORDER BY created_at ASC
    `, [mode, category]);
    return res.rows.map(r => ({
        name: r.name,
        content: r.content || '',
        path: `${r.path}/${r.name}`,
        mtime: r.mtime ? r.mtime.toISOString() : new Date().toISOString()
    }));
}

module.exports = {
    getPool,
    query,
    initDb,
    ensureProject,
    savePipelineFile,
    getFilesByCategory
};
