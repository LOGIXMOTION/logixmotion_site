require('dotenv').config();
const express = require('express');
const nodemailer = require('nodemailer');
const bodyParser = require('body-parser');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = process.env.PORT || 3000;
const FORM_MIN_FILL_MS = Number(process.env.FORM_MIN_FILL_MS || 2500);
const RATE_LIMIT_WINDOW_MS = Number(process.env.RATE_LIMIT_WINDOW_MS || 10 * 60 * 1000);
const RATE_LIMIT_MAX = Number(process.env.RATE_LIMIT_MAX || 5);
const FORM_SECRET = process.env.FORM_SECRET || crypto.randomBytes(24).toString('hex');

const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const submissionsByIp = new Map();

// Middleware
app.use(bodyParser.json({ limit: '10kb' }));
app.use(bodyParser.urlencoded({ extended: true, limit: '10kb' }));
app.use(express.static(path.join(__dirname)));

// Email Transporter Configuration
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
    }
});

function createFormToken(timestamp) {
    return crypto.createHmac('sha256', FORM_SECRET).update(String(timestamp)).digest('hex');
}

function isValidFormToken(timestamp, token) {
    if (!timestamp || !token) return false;
    const age = Date.now() - Number(timestamp);
    const MAX_TOKEN_AGE_MS = 2 * 60 * 60 * 1000; // 2 hours
    if (!Number.isFinite(age) || age < 0 || age > MAX_TOKEN_AGE_MS) return false;
    const expected = createFormToken(timestamp);
    const expectedBuf = Buffer.from(expected);
    const tokenBuf = Buffer.from(String(token));
    if (expectedBuf.length !== tokenBuf.length) return false;
    return crypto.timingSafeEqual(expectedBuf, tokenBuf);
}

function pruneRateLimit(windowStart) {
    for (const [ip, entry] of submissionsByIp.entries()) {
        if (entry.windowStart !== windowStart) {
            submissionsByIp.delete(ip);
        }
    }
}

function checkRateLimit(ip) {
    const now = Date.now();
    const windowStart = now - (now % RATE_LIMIT_WINDOW_MS);
    pruneRateLimit(windowStart);

    const entry = submissionsByIp.get(ip) || { windowStart, count: 0 };
    if (entry.count >= RATE_LIMIT_MAX) {
        return false;
    }

    entry.count += 1;
    submissionsByIp.set(ip, entry);
    return true;
}

// Routes
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'index.html'));
});

app.get('/form-token', (req, res) => {
    const timestamp = Date.now();
    res.status(200).json({ timestamp, token: createFormToken(timestamp) });
});

app.post('/send-email', async (req, res) => {
    const { name, email, message, company, formTimestamp, formToken } = req.body;
    const ip = req.ip || req.socket.remoteAddress || 'unknown';

    if (company && String(company).trim().length > 0) {
        return res.status(200).json({ success: true, message: 'Message sent successfully!' });
    }

    if (!name || !email || !message || !formTimestamp || !formToken) {
        return res.status(400).json({ success: false, message: 'All fields are required.' });
    }

    if (!emailRegex.test(String(email))) {
        return res.status(400).json({ success: false, message: 'Please enter a valid email address.' });
    }

    if (!isValidFormToken(formTimestamp, formToken)) {
        return res.status(400).json({ success: false, message: 'Your session expired. Refresh the page and try again.' });
    }

    if (Date.now() - Number(formTimestamp) < FORM_MIN_FILL_MS) {
        return res.status(400).json({ success: false, message: 'Please take a moment to complete the form before sending.' });
    }

    if (!checkRateLimit(ip)) {
        return res.status(429).json({ success: false, message: 'Too many messages from this IP. Please try again later.' });
    }

    const safeName = String(name).trim().slice(0, 120);
    const safeEmail = String(email).trim().slice(0, 160);
    const safeMessage = String(message).trim().slice(0, 5000);

    const mailOptions = {
        from: `"${safeName}" <${process.env.SMTP_FROM_EMAIL || process.env.SMTP_USER}>`,
        to: process.env.CONTACT_EMAIL || 'admin@logixmotion.com',
        replyTo: safeEmail,
        subject: `New Contact Request from ${safeName}`,
        text: `Name: ${safeName}\nEmail: ${safeEmail}\n\nMessage:\n${safeMessage}`,
        html: `
            <h3>New Contact Request</h3>
            <p><strong>Name:</strong> ${safeName}</p>
            <p><strong>Email:</strong> ${safeEmail}</p>
            <p><strong>Message:</strong></p>
            <p>${safeMessage.replace(/\n/g, '<br>')}</p>
        `
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully');
        res.status(200).json({ success: true, message: 'Message sent successfully!' });
    } catch (error) {
        console.error('Error sending email:', error);
        res.status(500).json({ success: false, message: 'Failed to send message. Please try again later.' });
    }
});

app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
    console.log(`Hi Aashique`)
});