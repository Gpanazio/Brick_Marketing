#!/usr/bin/env node
/**
 * migrate-legacy.js
 * 
 * One-shot migration script: reads legacy pipeline files from the filesystem
 * (created before PostgreSQL was set up) and inserts them into the database.
 * 
 * Usage:
 *   node scripts/migrate-legacy.js --dry-run   # preview only
 *   node scripts/migrate-legacy.js              # execute migration
 */

const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

// ── Config ──────────────────────────────────────────────────────────────────
const DRY_RUN = process.argv.includes('--dry-run');
const BASE_DIR = path.resolve(__dirname, '..');

const connectionString = process.env.DATABASE_PUBLIC_URL || process.env.DATABASE_URL;
if (!connectionString && !DRY_RUN) {
    console.error('❌ Set DATABASE_PUBLIC_URL or DATABASE_URL');
    process.exit(1);
}

const pool = connectionString
    ? new Pool({
        connectionString,
        max: 3,
        ssl: connectionString.includes('railway') ? { rejectUnauthorized: false } : false
    })
    : null;

// ── Directories to scan ─────────────────────────────────────────────────────
// history/{mode}/{category}/ is the main legacy structure
const HISTORY_DIR = path.join(BASE_DIR, 'history');
const MODES = ['marketing', 'ideias', 'projetos', 'originais'];
const CATEGORIES = ['briefing', 'wip', 'done', 'failed'];

// Also scan root wip/ directory (active legacy WIP files)
const ROOT_WIP_DIR = path.join(BASE_DIR, 'wip');

// Also scan done/archived
const ARCHIVED_DIRS = [
    { dir: path.join(HISTORY_DIR, 'marketing', 'done', 'archived'), mode: 'marketing', category: 'done' },
];

// ── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Extract jobId from a filename.
 * 
 * Patterns:
 *   briefing:  "1770403445630.txt" → jobId = "1770403445630"
 *              "1770825439_war_room_launch.md" → jobId = "1770825439_war_room_launch"
 *   wip:       "1770403445630_01_VALIDATOR.json" → jobId = "1770403445630"  (numeric-only prefix)
 *              "1770825439_war_room_launch_01_VALIDATOR.json" → jobId = "1770825439_war_room_launch"
 *              "1770403445630_FINAL.md" → jobId = "1770403445630"
 * 
 * Strategy: For WIP/done/failed, known step suffixes are stripped to get the jobId.
 * For briefings, the entire basename (sans extension) IS the jobId.
 */
const KNOWN_STEPS = [
    '01_VALIDATOR', '02_AUDIENCE', '03_RESEARCH', '04_CLAIMS',
    '05A_COPY_GPT', '05B_COPY_FLASH', '05C_COPY_SONNET',
    '06_COPY_SENIOR', '06_BRAND_GUARDIANS', '07_WALL', '07_CRITICS',
    '08_FILTRO_OPUS', 'FINAL', 'BRIEFING_INPUT',
    // ideias steps
    'PAIN_CHECK', 'MARKET_SCAN', 'ANGEL_GEN', 'DEVIL_GEN', 'VIABILITY', 'RAW_IDEA',
    // projetos steps
    'BRAND_DIGEST', 'IDEATION_FLASH', 'IDEATION_GPT', 'IDEATION_SONNET',
    'CONCEPT_CRITIC', 'EXECUTION_DESIGN', 'PROPOSAL', 'DIRECTOR',
    'REVISAO_1', 'PROJECT_INPUT',
    // originais steps
    'ANGEL', 'DEMON', 'TRIAGE', 'SALES_SHARK', 'CREATIVE_DOCTOR', 'DOCTOR_FINAL',
    // catch-all
    'PROCESSED',
    // revision diffs
    '_revision_diff',
];

function extractJobIdAndFilename(basename, category) {
    // For briefings, the whole basename is the identifier (used as both jobId and filename)
    if (category === 'briefing') {
        // Remove extension
        const name = basename.replace(/\.(txt|md|json)$/i, '');
        return { jobId: name, filename: basename };
    }

    // For wip/done/failed: strip known step suffix to get jobId
    const nameNoExt = basename.replace(/\.(txt|md|json|log)$/i, '');

    for (const step of KNOWN_STEPS) {
        const suffix = `_${step}`;
        if (nameNoExt.endsWith(suffix)) {
            const jobId = nameNoExt.slice(0, -suffix.length);
            return { jobId, filename: basename };
        }
    }

    // Fallback: if basename starts with digits, the jobId is the numeric prefix
    const numMatch = nameNoExt.match(/^(\d+)/);
    if (numMatch) {
        return { jobId: numMatch[1], filename: basename };
    }

    // Last resort: whole name is jobId
    return { jobId: nameNoExt, filename: basename };
}

/**
 * Try to extract a title from a briefing file content.
 */
function extractTitle(content) {
    // Try "# BRIEFING: some title"
    const h1 = content.match(/^#\s+(?:BRIEFING:\s*)?(.+)/m);
    if (h1) return h1[1].trim();

    // Try "**Job ID:** 123_some_title"
    const jobLine = content.match(/\*\*Job ID:\*\*\s*\d+_(.+)/);
    if (jobLine) return jobLine[1].replace(/_/g, ' ').trim();

    return null;
}

/**
 * Derive a human-readable title from a jobId slug.
 */
function titleFromJobId(jobId) {
    // "1770825439_war_room_launch" → "war room launch"
    const slug = jobId.replace(/^\d+_?/, '');
    if (!slug) return null;
    return slug.replace(/_/g, ' ').trim() || null;
}

// ── Scanner ─────────────────────────────────────────────────────────────────

function scanDir(dir, mode, category) {
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        // Skip directories (like archived/, logs/)
        if (stat.isDirectory()) continue;

        // Skip non-content files
        if (!/\.(txt|md|json|log)$/i.test(entry)) continue;

        const content = fs.readFileSync(fullPath, 'utf-8');
        const { jobId, filename } = extractJobIdAndFilename(entry, category);

        results.push({
            jobId,
            mode,
            category,
            filename,
            content,
            sourcePath: fullPath,
            mtime: stat.mtime,
        });
    }
    return results;
}

function scanWipSubdirs(dir, mode) {
    // Root wip/ has subdirectories like "1770825439_war_room_launch/"
    const results = [];
    if (!fs.existsSync(dir)) return results;

    const entries = fs.readdirSync(dir);
    for (const entry of entries) {
        const fullPath = path.join(dir, entry);
        const stat = fs.statSync(fullPath);

        if (stat.isDirectory()) {
            // Each subdir is a project; scan its files
            const subFiles = fs.readdirSync(fullPath);
            for (const sf of subFiles) {
                const sfPath = path.join(fullPath, sf);
                const sfStat = fs.statSync(sfPath);
                if (sfStat.isDirectory()) continue;
                if (!/\.(txt|md|json|log)$/i.test(sf)) continue;

                const content = fs.readFileSync(sfPath, 'utf-8');
                // jobId is the directory name; filename is the file within
                results.push({
                    jobId: entry,
                    mode,
                    category: 'wip',
                    filename: sf,
                    content,
                    sourcePath: sfPath,
                    mtime: sfStat.mtime,
                });
            }
        } else if (/\.(txt|md|json|log)$/i.test(entry)) {
            // Loose files in root wip/
            const content = fs.readFileSync(fullPath, 'utf-8');
            const { jobId, filename } = extractJobIdAndFilename(entry, 'wip');
            results.push({
                jobId,
                mode,
                category: 'wip',
                filename,
                content,
                sourcePath: fullPath,
                mtime: stat.mtime,
            });
        }
    }
    return results;
}

// ── Main ────────────────────────────────────────────────────────────────────

async function main() {
    console.log(`\n🔄 Legacy Migration ${DRY_RUN ? '(DRY RUN)' : '(LIVE)'}\n`);

    // 1. Collect all legacy files
    const allFiles = [];

    for (const mode of MODES) {
        for (const category of CATEGORIES) {
            const dir = path.join(HISTORY_DIR, mode, category);
            const files = scanDir(dir, mode, category);
            allFiles.push(...files);
        }
    }

    // Scan archived done
    for (const { dir, mode, category } of ARCHIVED_DIRS) {
        const files = scanDir(dir, mode, category);
        allFiles.push(...files);
    }

    // Scan root wip/ directory (default mode: marketing)
    const rootWipFiles = scanWipSubdirs(ROOT_WIP_DIR, 'marketing');
    allFiles.push(...rootWipFiles);

    console.log(`📦 Found ${allFiles.length} legacy files to migrate\n`);

    // Group by mode for summary
    const byMode = {};
    for (const f of allFiles) {
        const key = `${f.mode}/${f.category}`;
        byMode[key] = (byMode[key] || 0) + 1;
    }
    console.log('📊 Breakdown:');
    for (const [key, count] of Object.entries(byMode).sort()) {
        console.log(`   ${key}: ${count} files`);
    }
    console.log();

    if (DRY_RUN) {
        console.log('📋 Files that would be migrated:\n');
        // Group by jobId
        const byJob = {};
        for (const f of allFiles) {
            const key = `${f.mode}/${f.jobId}`;
            if (!byJob[key]) byJob[key] = [];
            byJob[key].push(`  ${f.category}/${f.filename} (${(f.content.length / 1024).toFixed(1)} KB)`);
        }
        for (const [job, files] of Object.entries(byJob).sort()) {
            console.log(`📁 ${job}`);
            files.forEach(f => console.log(f));
        }
        console.log(`\n✅ Dry run complete. Run without --dry-run to execute.\n`);
        return;
    }

    // 2. Execute migration
    let inserted = 0;
    let skipped = 0;
    let errors = 0;
    const projectsSeen = new Set();

    for (const f of allFiles) {
        try {
            // Upsert project
            const projectKey = `${f.jobId}::${f.mode}`;
            if (!projectsSeen.has(projectKey)) {
                projectsSeen.add(projectKey);

                // Determine title
                let title = null;
                if (f.category === 'briefing') {
                    title = extractTitle(f.content);
                }
                if (!title) {
                    title = titleFromJobId(f.jobId);
                }

                // Determine project status from category
                let status = 'briefing';
                if (f.category === 'done') status = 'archived';
                else if (f.category === 'wip') status = 'running';
                else if (f.category === 'failed') status = 'failed';

                await pool.query(`
                    INSERT INTO projects (job_id, mode, title, status, created_at, updated_at)
                    VALUES ($1, $2, $3, $4, $5, $5)
                    ON CONFLICT (job_id, mode) DO NOTHING
                `, [f.jobId, f.mode, title, status, f.mtime]);
            }

            // Insert pipeline file
            const result = await pool.query(`
                INSERT INTO pipeline_files (job_id, mode, category, filename, content, created_at, updated_at)
                VALUES ($1, $2, $3, $4, $5, $6, $6)
                ON CONFLICT DO NOTHING
                RETURNING id
            `, [f.jobId, f.mode, f.category, f.filename, f.content, f.mtime]);

            if (result.rowCount > 0) {
                inserted++;
            } else {
                skipped++;
            }
        } catch (err) {
            errors++;
            console.error(`  ❌ ${f.mode}/${f.category}/${f.filename}: ${err.message}`);
        }
    }

    console.log(`\n✅ Migration complete!`);
    console.log(`   Inserted: ${inserted}`);
    console.log(`   Skipped (already exist): ${skipped}`);
    console.log(`   Errors:   ${errors}`);

    // 3. Post-migration summary
    const summary = await pool.query(`
        SELECT mode, category, COUNT(*) AS count
        FROM pipeline_files
        GROUP BY mode, category
        ORDER BY mode, category
    `);
    console.log('\n📊 Current DB state:');
    console.table(summary.rows);

    await pool.end();
}

main().catch(err => {
    console.error('💥 Fatal error:', err);
    process.exit(1);
});
