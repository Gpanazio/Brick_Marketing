const path = require('path');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const { log } = require('../helpers/logger');

// SECURITY: Path Traversal Protection
function sanitizePath(userPath) {
    if (!userPath) return null;

    // Bloqueia qualquer '..' no input original (antes de normalizar)
    if (userPath.includes('..') || path.isAbsolute(userPath)) {
        log('warn', 'path_traversal_attempt_blocked', { input: userPath });
        return null;
    }

    // Normaliza o path
    const normalized = path.normalize(userPath).replace(/^(\.\.[\\/])+/, '');

    // Double-check: bloqueia se normalização introduziu '..'
    if (normalized.includes('..') || path.isAbsolute(normalized)) {
        log('warn', 'path_traversal_post_normalize_blocked', { input: userPath, normalized });
        return null;
    }

    return normalized;
}

// CORS config
const allowedOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'https://brickmarketing-production.up.railway.app',
    'https://war.brick.mov'
];

const corsMiddleware = cors({
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps, curl, Postman)
        if (!origin) return callback(null, true);

        if (allowedOrigins.includes(origin)) {
            callback(null, true);
        } else {
            log('warn', 'cors_blocked', { origin });
            callback(new Error('Not allowed by CORS'));
        }
    },
    credentials: true
});

// Rate limiting para /api/state (proteção sem quebrar dashboard)
const stateLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minuto
    max: 60, // 60 requests por minuto
    message: { error: 'Too many requests, slow down' }
});

// Disable cache for index.html to ensure updates are seen immediately
function noCacheHtml(req, res, next) {
    if (req.path === '/' || req.path === '/index.html') {
        res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
        res.set('Expires', '-1');
        res.set('Pragma', 'no-cache');
    }
    next();
}

module.exports = { sanitizePath, corsMiddleware, stateLimiter, noCacheHtml };
