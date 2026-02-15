const multer = require('multer');
const fs = require('fs');
const path = require('path');

// Multer config for file uploads
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        const uploadDir = path.join(__dirname, '..', '..', 'uploads');
        if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
        cb(null, uploadDir);
    },
    filename: (req, file, cb) => {
        const timestamp = Date.now();
        const safeName = file.originalname.replace(/[^a-z0-9.]/gi, '_');
        cb(null, `${timestamp}_${safeName}`);
    }
});

const upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
    fileFilter: (req, file, cb) => {
        const allowed = ['application/pdf', 'text/plain', 'text/markdown', 'image/png', 'image/jpeg', 'image/webp'];
        if (allowed.includes(file.mimetype) || file.originalname.endsWith('.md')) {
            cb(null, true);
        } else {
            cb(new Error('Tipo de arquivo não permitido'), false);
        }
    }
});

module.exports = { upload };
