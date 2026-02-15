const { log } = require('./logger');
const { getFilesForSocket } = require('./paths');

// Socket.IO: Emite estado atualizado para todos os clientes
function emitStateUpdate(io, mode) {
    const state = {
        mode,
        briefing: getFilesForSocket('briefing', mode),
        wip: getFilesForSocket('wip', mode),
        done: getFilesForSocket('done', mode),
        failed: getFilesForSocket('failed', mode)
    };
    io.emit('stateUpdate', state);
    log('info', 'websocket_state_emitted', { mode, clients: io.engine.clientsCount });
}

// Setup Socket.IO auth + connection handlers
function setupSocketIO(io, apiKey) {
    // Socket.IO middleware: Auth
    io.use((socket, next) => {
        const key = socket.handshake.auth.apiKey;

        if (key === apiKey) {
            return next();
        }

        log('warn', 'websocket_auth_failed', { id: socket.id, ip: socket.handshake.address });
        next(new Error('Authentication failed'));
    });

    io.on('connection', (socket) => {
        log('info', 'websocket_client_connected', { id: socket.id });

        socket.on('join', (room) => {
            socket.join(room);
            log('info', 'websocket_joined_room', { id: socket.id, room });
        });

        socket.on('subscribe', (mode) => {
            socket.join(mode);
            log('info', 'websocket_subscribed', { id: socket.id, mode });
        });

        socket.on('disconnect', () => {
            log('info', 'websocket_client_disconnected', { id: socket.id });
        });
    });
}

module.exports = { emitStateUpdate, setupSocketIO };
