const fs = require('fs');
const path = require('path');
const file = path.join(__dirname, 'vectorStore.js');
let code = fs.readFileSync(file, 'utf8');

// Insert config require
if (!code.includes("const config = require('./config');")) {
    code = code.replace(
        "const { pool } = require('./db');",
        "const { pool } = require('./db');\nconst config = require('./config');"
    );
}

// Modify syncVectors
code = code.replace(
    "async function syncVectors() {",
    "async function syncVectors() {\n    if (!config.features.useVectorDB || !process.env.DATABASE_URL) {\n        console.log(\"[Vector Store] Vector Lite mode active (or DB Offline). Skipping vector sync.\");\n        return;\n    }"
);

// Modify vectorSearch
code = code.replace(
    "async function vectorSearch(queryText, limit = 3) {\n    if (!queryText) return [];",
    "async function vectorSearch(queryText, limit = 3) {\n    if (!queryText || !config.features.useVectorDB || !process.env.DATABASE_URL) return [];"
);

// Modify forceReindexDB
code = code.replace(
    "async function forceReindexDB() {",
    "async function forceReindexDB() {\n    if (!config.features.useVectorDB || !process.env.DATABASE_URL) return false;"
);

fs.writeFileSync(file, code);
console.log("vectorStore.js modifications applied");
