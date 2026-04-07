const fs = require('fs');
const path = require('path');

const serverPath = path.join(__dirname, 'server.js');
let serverCode = fs.readFileSync(serverPath, 'utf8');

// We will only move a few safe endpoints to prove the concept without breaking complex state.
// Endpoints that don't need complex WA state:
// /api/logs, /api/status (needs minor WA state), /api/settings, /api/system/logs/export

if (!fs.existsSync(path.join(__dirname, 'routes'))) {
    fs.mkdirSync(path.join(__dirname, 'routes'));
}

const apiRouterCode = `
const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const router = express.Router();

module.exports = function(globals) {
    const { requireAuth, getBotHealth, botSettings, saveSettings } = globals;

    function parseLogDate(line) {
        const match = line.match(/^\\[(.*?)\\]/);
        if (!match) return null;
        try {
            const dateStr = match[1].replace(/[\\u202f\\u00a0]/g, ' ');
            const d = new Date(dateStr);
            return isNaN(d.getTime()) ? null : d;
        } catch (e) {
            return null;
        }
    }

    router.get('/logs', requireAuth, (req, res) => {
        const range = req.query.range || 'all';
        const logPath = path.join(__dirname, '..', 'chatbot_logs.txt');
        if (!fs.existsSync(logPath)) return res.json({ logs: ["No logs found."] });
        
        let logs = fs.readFileSync(logPath, 'utf8').split('\\n').filter(Boolean);
        
        if (range !== 'all') {
            const now = new Date();
            const limit = new Date();
            if (range === '24h') limit.setHours(now.getHours() - 24);
            else if (range === '7d') limit.setDate(now.getDate() - 7);
            else if (range === '30d') limit.setDate(now.getDate() - 30);
            
            logs = logs.filter(line => {
                const date = parseLogDate(line);
                return date && date >= limit;
            });
        }
        res.json({ logs: logs.slice(-100) });
    });

    router.get('/settings', requireAuth, (req, res) => {
        res.json(botSettings);
    });

    router.post('/settings', requireAuth, (req, res) => {
        const { aiMode } = req.body;
        if (aiMode) {
            botSettings.aiMode = aiMode;
            saveSettings(botSettings);
            res.json({ status: "success", aiMode });
        } else {
            res.status(400).json({ error: "Invalid settings" });
        }
    });

    router.get('/system/logs/export', requireAuth, (req, res) => {
        const logFile = path.join(__dirname, '..', 'chatbot_logs.txt');
        if (fs.existsSync(logFile)) {
            res.download(logFile, \`ImmiCare_Logs_\${new Date().toISOString().split('T')[0]}.txt\`);
        } else {
            res.status(404).send("File log belum tersedia.");
        }
    });

    return router;
};
`;

fs.writeFileSync(path.join(__dirname, 'routes', 'api.js'), apiRouterCode);

// Attempt to replace the extracted routes in server.js safely by injecting the router hook
if (!serverCode.includes("require('./routes/api')")) {
    serverCode = serverCode.replace(
        "app.use(express.static('public'));",
        "app.use(express.static('public'));\n\n// Modular API Routes\nconst apiRoutes = require('./routes/api')({\n    requireAuth, \n    getBotHealth: global.getBotHealth,\n    botSettings, \n    saveSettings\n});\napp.use('/api', apiRoutes);"
    );
    // Since removing block by block via string replace is flaky, we'll leave the old endpoints for now
    // but the router is mounted BEFORE them, so Express handles '/api/logs' via router first.
    // We will clean up the duplicates to save space.
    // Let's strip out the old /api/logs
    serverCode = serverCode.replace(/app\.get\('\/api\/logs', requireAuth, \(req, res\) => \{[\s\S]*?\}\);/g, '');
    serverCode = serverCode.replace(/function parseLogDate\(line\) \{[\s\S]*?\}\n/g, ''); // also remove the helper
    serverCode = serverCode.replace(/app\.get\('\/api\/settings', requireAuth, \(req, res\) => \{[\s\S]*?\}\);/g, '');
    serverCode = serverCode.replace(/app\.post\('\/api\/settings', requireAuth, \(req, res\) => \{[\s\S]*?\}\);/g, '');
    serverCode = serverCode.replace(/app\.get\('\/api\/system\/logs\/export', requireAuth, \(req, res\) => \{[\s\S]*?\}\);/g, '');
}

fs.writeFileSync(serverPath, serverCode);
console.log("Modularization applied (Tahap 6 step 1).");
