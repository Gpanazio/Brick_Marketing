// Startup log - helps debug Railway deployment issues
console.log(`[STARTUP] Node ${process.version} | PID ${process.pid} | PORT ${process.env.PORT || 3000}`);
console.log(`[STARTUP] HOME=${process.env.HOME} | RAILWAY_ENVIRONMENT=${process.env.RAILWAY_ENVIRONMENT}`);

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const bodyParser = require('body-parser');

// Helpers
const { log } = require('./server/helpers/logger');
const { ensureDirectories } = require('./server/helpers/paths');
const { loadMetrics, saveMetrics } = require('./server/helpers/metrics');
const { setupSocketIO } = require('./server/helpers/socket');

// Middleware
const { createAuthMiddleware } = require('./server/middleware/auth');
const { corsMiddleware, stateLimiter, noCacheHtml } = require('./server/middleware/security');

// Routes
const healthRoutes = require('./server/routes/health');
const stateRoutes = require('./server/routes/state');
const briefingsRoutes = require('./server/routes/briefings');
const filesRoutes = require('./server/routes/files');
const costsRoutes = require('./server/routes/costs');
const pipelineRoutes = require('./server/routes/pipeline');
const feedbackRoutes = require('./server/routes/feedback');
const revisionsRoutes = require('./server/routes/revisions');
const projectsRoutes = require('./server/routes/projects');

// ============================================================================
// APP SETUP
// ============================================================================
const app = express();
const httpServer = http.createServer(app);
const io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] }
});

app.set('io', io);

const PORT = process.env.PORT || 3000;
const API_KEY = process.env.API_KEY || 'brick-squad-2026';

app.set('trust proxy', 1);

// ============================================================================
// MIDDLEWARE
// ============================================================================
app.use(corsMiddleware);
app.use(bodyParser.json({ limit: '10mb' }));
app.use(noCacheHtml);
app.use(express.static(path.join(__dirname, 'public')));
app.use('/api/state', stateLimiter);
app.use('/api', createAuthMiddleware(API_KEY));

// ============================================================================
// SOCKET.IO
// ============================================================================
setupSocketIO(io, API_KEY);

// ============================================================================
// STARTUP
// ============================================================================
ensureDirectories();
loadMetrics();
setInterval(saveMetrics, 5 * 60 * 1000);

// ============================================================================
// ROUTES
// ============================================================================
app.use('/api', healthRoutes);
app.use('/api', stateRoutes);
app.use('/api', briefingsRoutes);
app.use('/api', filesRoutes);
app.use('/api', costsRoutes);
app.use('/api', pipelineRoutes);
app.use('/api', feedbackRoutes);
app.use('/api', revisionsRoutes);
app.use('/api', projectsRoutes);

// Shareable pipeline URLs (catch-all, must be after /api routes)
app.use('/', projectsRoutes);

// ============================================================================
// GRACEFUL SHUTDOWN
// ============================================================================
let server;

const gracefulShutdown = (signal) => {
    if (gracefulShutdown.isShuttingDown) return;
    gracefulShutdown.isShuttingDown = true;
    log('info', 'shutdown_signal_received', { signal });
    console.log(`\n⚠️ ${signal} received, shutting down gracefully...`);

    saveMetrics();

    if (server) {
        server.close(() => {
            log('info', 'server_closed');
            console.log('✅ Server closed');
            process.exit(0);
        });
        const shutdownTimeout = setTimeout(() => {
            log('warn', 'forced_shutdown');
            console.log('⚠️ Forced shutdown after timeout');
            process.exit(1);
        }, 10000);
        shutdownTimeout.unref();
    } else {
        process.exit(0);
    }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('uncaughtException', (err) => {
    log('error', 'uncaught_exception', { error: err.message, stack: err.stack });
    console.error('❌ Uncaught Exception:', err);
    try { saveMetrics(); } catch (saveErr) {
        log('error', 'metrics_save_failed_on_uncaught_exception', { error: saveErr.message });
    }
    process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
    log('error', 'unhandled_rejection', { reason: String(reason) });
    console.error('❌ Unhandled Rejection:', reason);
});

// ============================================================================
// START SERVER
// ============================================================================
server = httpServer.listen(PORT, '0.0.0.0', () => {
    log('info', 'server_started', { port: PORT, host: '0.0.0.0', websocket: true });
    console.log(`🚀 Brick AI War Room running on http://0.0.0.0:${PORT}`);
    console.log(`🔌 WebSocket enabled`);
});
