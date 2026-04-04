const axios = require('axios');
require('dotenv').config();

async function analyze() {
    const url = process.env.GOOGLE_SCRIPT_WEB_APP_URL;
    if (!url) {
        console.log("No URL found in .env");
        return;
    }

    try {
        console.log("Fetching from:", url);
        const res = await axios.get(url);
        let data = res.data;
        if (typeof data === 'string') data = JSON.parse(data);
        
        let raw = [];
        if (Array.isArray(data)) raw = data;
        else if (data && data.data) raw = data.data;

        console.log("Total rows from Google:", raw.length);
        
        const valid = [];
        const duplicates = [];
        const empty = [];
        const seen = new Set();

        raw.forEach((row, idx) => {
            const q = (row.Question || row.question || "").toLowerCase().trim();
            const a = (row.Answer || row.answer || "").trim();
            
            if (!q || !a) {
                empty.push(idx + 1);
                return;
            }

            if (seen.has(q)) {
                duplicates.push({ row: idx + 1, question: q });
            } else {
                seen.add(q);
                valid.push(row);
            }
        });

        console.log("Valid unique entries:", valid.length);
        console.log("Empty rows/No Q-A (skipped):", empty.length);
        console.log("Duplicate questions (skipped/merged):", duplicates.length);
        
        if (duplicates.length > 0) {
            console.log("\nSample Duplicates:");
            duplicates.slice(0, 5).forEach(d => console.log(`- Row ${d.row}: ${d.question}`));
        }
        
    } catch (e) {
        console.error("Error:", e.message);
    }
}

analyze();
