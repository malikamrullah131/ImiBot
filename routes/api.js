const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { fetchSpreadsheetData, addKnowledgeBaseEntry } = require('../sheets');
const { syncToNeon, fetchFromNeon, pool } = require('../db');
const { syncVectors, forceReindexDB, vectorSearch } = require('../vectorStore');
const { getInsights, generateSuggestedAnswer, suggestCategory } = require('../analytics');
const { getAIStatus, clearCacheForQuestion, clearAllCache, reflectOnInteraction } = require('../ai');
const config = require('../config');

module.exports = function(context) {
    const router = express.Router();
    const { requireAuth, getBotHealth, getKBCount, botSettings, saveSettings } = context;

    // --- REUSABLE UTILS (Moved from server.js) ---
    const backlogPath = path.join(__dirname, '../backlog.json');
    const loadBacklog = () => fs.existsSync(backlogPath) ? JSON.parse(fs.readFileSync(backlogPath, 'utf8')) : [];
    const saveBacklog = (data) => fs.writeFileSync(backlogPath, JSON.stringify(data, null, 2));

    const reviewsPath = path.join(__dirname, '../reviews.json');
    const loadReviews = () => fs.existsSync(reviewsPath) ? JSON.parse(fs.readFileSync(reviewsPath, 'utf8')) : [];
    const saveReviews = (data) => fs.writeFileSync(reviewsPath, JSON.stringify(data, null, 2));

    const deadchatPath = path.join(__dirname, '../deadchat.json');
    const loadDeadChat = () => fs.existsSync(deadchatPath) ? JSON.parse(fs.readFileSync(deadchatPath, 'utf8')) : [];

    const pendingPath = path.join(__dirname, '../pending.json');
    const removeFromPending = (question) => {
        if (!fs.existsSync(pendingPath)) return;
        try {
            let items = JSON.parse(fs.readFileSync(pendingPath, 'utf8'));
            const normalizedQ = question.toLowerCase().trim().replace(/[?.,!]/g, "");
            items = items.filter(it => (it.normalized || it.question.toLowerCase().trim().replace(/[?.,!]/g, "")) !== normalizedQ);
            fs.writeFileSync(pendingPath, JSON.stringify(items, null, 2));
        } catch (e) { }
    };

    const parseLogDate = (line) => {
        const match = line.match(/^\[(.*?)\]/);
        if (!match) return null;
        try {
            const dateStr = match[1].replace(/[\u202f\u00a0]/g, ' ');
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? null : d;
        } catch (e) { return null; }
    };

    // --- SYSTEM & STATUS ---
    router.get('/status', requireAuth, (req, res) => {
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        res.json({
            status: "Connected",
            kb_entries: getKBCount ? getKBCount() : 0,
            last_sync: new Date().toLocaleTimeString(),
            uptime: Math.round(process.uptime()),
            ram_usage: ((1 - freeMem / totalMem) * 100).toFixed(1),
            aiMode: config.botMode,
            vectorMode: config.vectorMode,
            aiReady: getAIStatus(),
            deadchat_count: loadDeadChat().length,
            backlog_count: loadBacklog().length
        });
    });

    router.get('/system/health', requireAuth, (req, res) => {
        const aiHealth = getBotHealth ? getBotHealth() : { status: "OK" };
        const totalMem = os.totalmem();
        const freeMem = os.freemem();
        res.json({
            ...aiHealth,
            uptime: Math.round(process.uptime()),
            hardware: {
                cpu: os.cpus()[0].model,
                ramUsage: ((1 - freeMem / totalMem) * 100).toFixed(1),
                platform: os.platform()
            }
        });
    });

    // --- KNOWLEDGE BASE ---
    router.get('/kb', requireAuth, async (req, res) => {
        const data = await fetchFromNeon();
        res.json({ kb: data });
    });

    router.get('/logs', requireAuth, (req, res) => {
        const range = req.query.range || '24h';
        const logPath = path.join(__dirname, '../chatbot_logs.txt');
        if (!fs.existsSync(logPath)) return res.json({ logs: [] });
        let logs = fs.readFileSync(logPath, 'utf8').split('\n').filter(Boolean);
        if (range !== 'all') {
            const now = new Date();
            const limit = new Date();
            if (range === '24h') limit.setHours(now.getHours() - 24);
            else if (range === '7d') limit.setDate(now.getDate() - 7);
            logs = logs.filter(line => {
                const date = parseLogDate(line);
                return date && date >= limit;
            });
        }
        res.json({ logs: logs.slice(-100) });
    });

    router.post('/approve', requireAuth, async (req, res) => {
        try {
            const { question, answer, category } = req.body;
            if (!question || !answer) return res.status(400).json({ error: "Missing data" });
            const newEntry = { Question: question, Answer: answer, Category: category || "Umum" };
            await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, question, answer, category);
            // Instant local update (if memory cache was shared, but here we just push to DB)
            await syncToNeon([newEntry]);
            await syncVectors();
            removeFromPending(question);
            res.json({ status: "success", message: "Data berhasil ditambahkan!" });
        } catch (err) {
            res.status(500).json({ error: err.message });
        }
    });

    // --- REVIEWS & MODERATION ---
    router.get('/reviews', requireAuth, (req, res) => {
        res.json({ reviews: loadReviews() });
    });

    router.post('/reviews/decision', requireAuth, async (req, res) => {
        try {
            const { id, decision } = req.body;
            let reviews = loadReviews();
            const review = reviews.find(r => r.id == id);
            if (!review) return res.status(404).json({ error: "Review not found" });

            if (decision === 'merged') {
                // Logic to merge variants would go here
            } else {
                await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, review.newQuestion, review.existingAnswer);
            }
            reviews = reviews.filter(r => r.id != id);
            saveReviews(reviews);
            res.json({ status: "success", message: "Keputusan disimpan!" });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // --- BACKLOG ---
    router.get('/backlog', requireAuth, (req, res) => {
        res.json({ backlog: loadBacklog() });
    });

    router.post('/backlog/resolve', requireAuth, async (req, res) => {
        try {
            const { from, body, answer, timestamp, action, client } = req.body; // Use shared client if possible
            let backlog = loadBacklog();
            if (action === 'resolve') {
                // Sending WA should be done in server.js or via an internal event
                // Here we just update the DB
                await addKnowledgeBaseEntry(process.env.GOOGLE_SCRIPT_WEB_APP_URL, body, answer);
            }
            backlog = backlog.filter(item => item.timestamp !== timestamp || item.from !== from);
            saveBacklog(backlog);
            res.json({ status: "success", message: "Backlog updated." });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    // --- SYSTEM CONTROLS ---
    router.post('/system/restart', requireAuth, (req, res) => {
        res.json({ message: "Restarting..." });
        setTimeout(() => process.exit(0), 1000);
    });

    router.post('/system/maintenance/clean', requireAuth, (req, res) => {
        clearAllCache();
        res.json({ message: "Cache cleaned." });
    });

    // --- BROADCAST & RECIPIENTS (New implementation) ---
    router.get('/recipients', requireAuth, (req, res) => {
        const logPath = path.join(__dirname, '../chatbot_logs.txt');
        if (!fs.existsSync(logPath)) return res.json({ recipients: [] });
        
        try {
            const logs = fs.readFileSync(logPath, 'utf8');
            // Extract IDs like 628xxx@c.us or 628xxx@lid (limited to @lid as per logs)
            const matches = logs.match(/\d+@(lid|c\.us)/g) || [];
            const uniqueRecipients = [...new Set(matches)];
            res.json({ recipients: uniqueRecipients });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    router.post('/broadcast', requireAuth, async (req, res) => {
        const { message, recipients } = req.body;
        const zapclient = context.client; // Passed from server.js
        if (!zapclient) return res.status(500).json({ error: "WA Client not ready" });

        // Run in background to avoid timeout
        res.json({ status: "success", message: "Broadcast started" });

        for (const target of recipients) {
            try {
                await zapclient.sendMessage(target, message);
                // Delay 3-5 seconds to prevent ban
                await new Promise(r => setTimeout(r, 3000 + Math.random() * 2000));
            } catch (e) {
                console.error(`Broadcast failed to ${target}: ${e.message}`);
            }
        }
    });

    // --- SYNC ENGINE ---
    router.post('/sync', requireAuth, async (req, res) => {
        try {
            const { raw: data } = await fetchSpreadsheetData(process.env.GOOGLE_SCRIPT_WEB_APP_URL);
            if (!data || data.length === 0) throw new Error("No data from Spreadsheet");
            
            await syncToNeon(data);
            await syncVectors();
            clearAllCache();
            res.json({ status: "success", count: data.length });
        } catch (e) { res.status(500).json({ error: e.message }); }
    });

    return router;
};
