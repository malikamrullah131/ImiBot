const fs = require('fs');
const data = JSON.parse(fs.readFileSync('Final_KB_Rombak.json', 'utf8'));

let output = "QUESTION\tANSWER\n"; // Tab separated for easy copy-paste to Sheets

data.forEach(item => {
    // Sanitize by removing tabs or newlines within cell values
    const q = item.Question.replace(/\n/g, ' ').replace(/\t/g, ' ');
    const a = item.Answer.replace(/\n/g, ' ').replace(/\t/g, ' ');
    output += `${q}\t${a}\n`;
});

fs.writeFileSync('UPLOAD_KE_SPREADSHEET.txt', output, 'utf8');
console.log("📄 File 'UPLOAD_KE_SPREADSHEET.txt' siap. Silakan buka dan copy-paste ke Google Sheets.");
