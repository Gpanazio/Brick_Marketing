const { log } = require('./logger');

// Telegram notification (legacy - keep for direct messages)
async function notifyTelegram(message) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;
    if (!token || !chatId) return;

    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'Markdown' })
        });
        log('info', 'telegram_notification_sent');
    } catch (e) {
        log('error', 'telegram_notification_failed', { error: e.message });
    }
}

// Douglas notification (Telegram only)
async function notifyDouglas(data) {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_CHAT_ID;

    if (!token || !chatId) {
        return;
    }

    // Só envia Telegram aqui para FEEDBACK (evita duplicar alerta de briefing)
    if (!data.feedbackAction) {
        return;
    }

    const message = `🔄 FEEDBACK: ${data.feedbackText}

Projeto: ${data.jobId}
Modo: ${data.mode}`;

    try {
        await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                chat_id: chatId,
                text: message
            })
        });
        log('info', 'douglas_command_sent', { jobId: data.jobId, type: 'feedback' });
    } catch (e) {
        log('error', 'douglas_command_failed', { error: e.message });
    }
}

module.exports = { notifyTelegram, notifyDouglas };
