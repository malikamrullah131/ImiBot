const fs = require('fs');

const rawData = JSON.parse(fs.readFileSync('all_kb_data.json', 'utf8'));

function normalizeAnswer(ans) {
    if (!ans) return "";
    return ans.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[.,!?;:*]/g, '')
        .trim();
}

function normalizeQuestion(q) {
    if (!q) return "";
    return q.toLowerCase()
        .replace(/\s+/g, ' ')
        .replace(/[?]/g, '')
        .trim();
}

const groups = new Map();

rawData.forEach(item => {
    const qRaw = item.Question || item.question || "";
    const aRaw = item.Answer || item.answer || "";
    const normA = normalizeAnswer(aRaw);
    
    if (!groups.has(normA)) {
        groups.set(normA, {
            originalAnswer: aRaw,
            questions: new Set()
        });
    }
    
    // Split combined questions if they already have commas
    const qs = qRaw.split(',').map(s => s.trim()).filter(s => s.length > 0);
    qs.forEach(q => groups.get(normA).questions.add(q));
});

const merged = [];
let counter = 1;

for (const [normA, data] of groups.entries()) {
    if (normA === "") continue;
    
    const combinedQ = Array.from(data.questions).join(', ');
    merged.push({
        No: counter++,
        Question: combinedQ,
        Answer: data.originalAnswer
    });
}

fs.writeFileSync('merged_kb_data.json', JSON.stringify(merged, null, 2), 'utf8');

// Generate a summary report
console.log(`✅ Merging Complete!`);
console.log(`📊 Original Entries: ${rawData.length}`);
console.log(`📉 Merged Entries: ${merged.length}`);
console.log(`Saved to merged_kb_data.json`);
