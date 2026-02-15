// Structured logging
const log = (level, event, data = {}) => {
    console.log(JSON.stringify({
        level,
        event,
        ...data,
        timestamp: new Date().toISOString()
    }));
};

module.exports = { log };
