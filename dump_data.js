require('dotenv').config();
const { fetchSpreadsheetData } = require('./sheets');
const fs = require('fs');

async function dump() {
    const r = await fetchSpreadsheetData(process.env.GOOGLE_SCRIPT_WEB_APP_URL);
    fs.writeFileSync('all_kb_data.json', JSON.stringify(r.raw, null, 2), 'utf8');
}
dump();
