const axios = require('axios');
const fs = require('fs');
const path = require('path');

/**
 * Fetches JSON data from a Google Apps Script Web App link and formats it.
 * @param {string} url - The URL to the Web App
 * @returns {Promise<string>} The parsed context string.
 */
async function fetchSpreadsheetData(url) {
    if (!url) return '';

    try {
        const response = await axios.get(url);
        
        // DEBUG LOGGING TO FILE
        const debugInfo = {
            status: response.status,
            dataType: typeof response.data,
            dataPreview: typeof response.data === 'string' ? response.data.substring(0, 500) : JSON.stringify(response.data).substring(0, 500),
            timestamp: new Date().toISOString()
        };
        fs.writeFileSync(path.join(__dirname, 'debug_sheets.txt'), JSON.stringify(debugInfo, null, 2));

        let rawData = response.data;
        
        // If Google returns a string, try to parse it as JSON
        if (typeof rawData === 'string') {
            try {
                rawData = JSON.parse(rawData);
            } catch (e) {
                console.error("Failed to parse Google Script response as JSON:", e.message);
            }
        }

        // Robust check: Handle both direct arrays and nested data objects
        let rawResults = [];
        if (Array.isArray(rawData)) {
            rawResults = rawData;
        } else if (rawData && Array.isArray(rawData.data)) {
            rawResults = rawData.data;
        } else if (rawData && typeof rawData === 'object') {
            // Try to find any array property
            const arrays = Object.values(rawData).filter(v => Array.isArray(v));
            if (arrays.length > 0) rawResults = arrays[0];
        }

        if (rawResults.length === 0) {
            console.warn("⚠️ No data returned from Google Apps Script. Check if the spreadsheet has content.");
            return { context: "No data available in the spreadsheet.", raw: [] };
        }

        console.log(`✅ Successfully fetched ${rawResults.length} entries from Google Sheets.`);

        // Format the JSON data into a readable string for the AI
        let contextString = "KNOWLEDGE BASE DATA FROM SPREADSHEET:\n";
        rawResults.forEach((row, index) => {
            contextString += `Entry ${index + 1}:\n`;
            for (const [key, value] of Object.entries(row)) {
                if (value && String(value).trim() !== '') {
                    contextString += `- ${key}: ${value}\n`;
                }
            }
            contextString += '\n';
        });
        
        return { context: contextString, raw: rawResults };
    } catch (error) {
        console.error("Error fetching data from Google Apps Script:", error.message);
        throw error;
    }
}

/**
 * Adds a new entry to the knowledge base via POST request to Google Apps Script.
 * @param {string} url - The URL to the Web App
 * @param {string} question - Improved user question
 * @param {string} answer - Approved accurate answer
 */
async function addKnowledgeBaseEntry(url, question, answer) {
    if (!url) throw new Error("Google Script URL is missing.");

    try {
        const response = await axios.post(url, {
            question: question,
            answer: answer
        });
        
        return response.data;
    } catch (error) {
        console.error("Error adding data to Google Sheets:", error.message);
        throw error;
    }
}

module.exports = {
    fetchSpreadsheetData,
    addKnowledgeBaseEntry
};
