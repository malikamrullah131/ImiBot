const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'server.js');
let code = fs.readFileSync(file, 'utf8');

const loggerInjection = `const chalk = require('chalk');
function appendLog(type, sender, msg) {
    const timestamp = new Date().toLocaleString();
    const strLog = \`[\${timestamp}] [\${type}] \${sender}: \${msg}\\n\`;
    fs.appendFileSync(path.join(__dirname, 'chatbot_logs.txt'), strLog);
    
    if (type === 'Message Received') {
        console.log(chalk.blue(\`[📩 USER] \${sender}: \`) + chalk.white(msg));
    } else if (type === 'AI Response') {
        let snippet = msg.length > 80 ? msg.substring(0, 80) + '...' : msg;
        console.log(chalk.green(\`[🤖 AI TO] \${sender}: \`) + chalk.gray(snippet));
    } else if (type === 'ERROR') {
        console.log(chalk.red(\`[❌ ERROR] \${sender}: \`) + chalk.redBright(msg));
    } else if (type === 'STATUS') {
        console.log(chalk.yellow(\`[⚡ STATUS] \`) + chalk.yellowBright(msg));
    } else if (type === 'BROADCAST') {
        console.log(chalk.magenta(\`[📢 BROADCAST] \`) + chalk.magentaBright(msg));
    } else {
        console.log(chalk.cyan(\`[\${type}] \${sender}: \`) + msg);
    }
}
`;

if (!code.includes('function appendLog')) {
    code = code.replace("require('dotenv').config();", "require('dotenv').config();\n" + loggerInjection);
}

// Global regex to replace old logging patterns safely
code = code.replace(
    /const logMsg = \`\[\$\{timestamp\}\] \[STATUS\] WhatsApp authenticated!\`;\s*console\.log\(logMsg\);\s*fs\.appendFileSync\(path\.join\(__dirname, 'chatbot_logs\.txt'\), logMsg \+ "\\n"\);/g,
    "appendLog('STATUS', 'System', 'WhatsApp authenticated!');"
);

code = code.replace(
    /const logMsg = \`\[\$\{timestamp\}\] \[STATUS\] WhatsApp Bot is ready and connected!\`;\s*console\.log\(logMsg\);\s*fs\.appendFileSync\(path\.join\(__dirname, 'chatbot_logs\.txt'\), logMsg \+ "\\n"\);/g,
    "appendLog('STATUS', 'System', 'WhatsApp Bot is ready and connected!');"
);

code = code.replace(
    /const logMsg = \`\[\$\{timestamp\}\] \[STATUS\] WhatsApp disconnected: \$\{reason\}\`;\s*console\.log\(logMsg\);\s*fs\.appendFileSync\(path\.join\(__dirname, 'chatbot_logs\.txt'\), logMsg \+ "\\n"\);/g,
    "appendLog('STATUS', 'System', \`WhatsApp disconnected: \${reason}\`);"
);

code = code.replace(
    /const logEntry = \`\[\$\{timestamp\}\] \[Message Received\] \$\{msg\.from\}: \$\{msg\.body\}\\n\`;\s*console\.log\(\`\[Message Received\] \$\{msg\.from\}: \$\{msg\.body\}\`\);\s*fs\.appendFileSync\(path\.join\(__dirname, 'chatbot_logs\.txt'\), logEntry\);/g,
    "appendLog('Message Received', msg.from, msg.body);"
);

code = code.replace(
    /const aiLogEntry = \`\[\$\{timestamp\}\] \[AI Response\] to \$\{from\}: \$\{reply\}\\n\\n\`;\s*fs\.appendFileSync\(path\.join\(__dirname, 'chatbot_logs\.txt'\), aiLogEntry\);/g,
    "appendLog('AI Response', from, reply);"
);

if (!code.includes("global.io.emit('backlog_update')")) {
    code = code.replace(
        "saveBacklog(backlog);\n                        await client.sendMessage(item.from, getRandomBusyMessage());",
        "saveBacklog(backlog);\n                        if (global.io) global.io.emit('backlog_update');\n                        if (global.io) global.io.emit('notification', { message: 'Pertanyaan masuk ke antrean (Backlog)!', playSound: true, type: 'warning' });\n                        await client.sendMessage(item.from, getRandomBusyMessage());"
    );
}

if (!code.includes("global.io.emit('notification', { message: 'Siaran telah selesai'")) {
    code = code.replace(
        "console.log('[ADMIN] Broadcast sequence completed.');",
        "console.log('[ADMIN] Broadcast sequence completed.');\n        if (global.io) global.io.emit('notification', { message: 'Siaran telah selesai', playSound: true });"
    );
}

fs.writeFileSync(file, code);
console.log('Done refactoring logs and socket emits.');
