const { log } = require('../helpers/logger');

// Auth middleware - ALLOW ALL READ-ONLY ACCESS FOR DASHBOARD
function createAuthMiddleware(apiKey) {
    return (req, res, next) => {
        // Allow public assets/root
        if (req.method === 'GET' && (req.path === '/' || !req.path.startsWith('/'))) {
            return next();
        }

        // Allow ALL GET requests to API (Read-Only Dashboard)
        // The dashboard needs state, history, metrics, architecture, etc.
        // We only protect write actions (POST, PUT, DELETE)
        if (req.method === 'GET') {
            return next();
        }

        // SECURITY: All write operations now require API Key (no exceptions)
        // Previously allowed /approve, /feedback, /revisions without key (CSRF risk)
        // Frontend now must send X-API-Key header for all mutations
        const key = req.headers['x-api-key'] || req.query.key;
        if (key === apiKey) {
            return next();
        }

        log('warn', 'unauthorized_write_attempt', { path: req.path, method: req.method });
        res.status(401).json({ error: 'Unauthorized' });
    };
}

module.exports = { createAuthMiddleware };
