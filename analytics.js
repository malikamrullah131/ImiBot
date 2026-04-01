const axios = require('axios');
const { BetaAnalyticsDataClient } = require('@google-analytics/data');
const { GoogleGenerativeAI } = require("@google/generative-ai");
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Initialize GA4 Data Client (for reports)
let analyticsClient;
try {
    if (process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON) {
        const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
        analyticsClient = new BetaAnalyticsDataClient({ credentials });
    }
} catch (e) {
    console.warn("Analytics Data API client could not be initialized. Check GOOGLE_APPLICATION_CREDENTIALS_JSON.");
}

/**
 * Tracks a user query to GA4 using the Measurement Protocol.
 * @param {string} clientId - Unique ID for the user (e.g. WhatsApp ID)
 * @param {string} queryText - The text asked by the user
 * @param {boolean} hasAnswer - Whether the bot found an answer in the KB
 */
async function trackEvent(clientId, queryText, hasAnswer) {
    const measurementId = process.env.GA4_MEASUREMENT_ID;
    const apiSecret = process.env.GA4_API_SECRET;

    if (!measurementId || !apiSecret) {
        console.warn("GA4 Measurement ID or API Secret missing. Skipping tracking.");
        return;
    }

    const url = `https://www.google-analytics.com/mp/collect?measurement_id=${measurementId}&api_secret=${apiSecret}`;

    try {
        await axios.post(url, {
            client_id: clientId.replace(/[^a-zA-Z0-9]/g, ''), // GA4 client_id must be alphanumeric
            events: [{
                name: 'user_query',
                params: {
                    query_content: queryText,
                    has_kb_answer: hasAnswer ? 1 : 0
                }
            }]
        });
    } catch (error) {
        console.error("Error tracking to GA4:", error.message);
    }
}

/**
 * Fetches insights from local logs as a fallback or supplemental data.
 */
function getLocalInsights() {
    const filePath = path.join(__dirname, 'chatbot_logs.txt');
    if (!fs.existsSync(filePath)) return [];

    const data = fs.readFileSync(filePath, 'utf8').split("\n");
    const freq = {};
    
    data.forEach(line => {
        if (line.includes('[Message Received]')) {
            const match = line.match(/\[Message Received\] .*?: (.*)/);
            if (match && match[1]) {
                const query = match[1].trim().toLowerCase();
                if (query.length > 5) {
                    freq[query] = (freq[query] || 0) + 1;
                }
            }
        }
    });

    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([query, count]) => ({ query, count }));
}

/**
 * Fetches insights from GA4 Data API.
 * Specifically looks for frequent queries.
 */
async function getInsights() {
    // If GA4 is not configured or fails, fallback to local insights
    let insights = [];
    
    if (analyticsClient) {
        const propertyId = process.env.GA4_PROPERTY_ID;
        if (propertyId) {
            try {
                const [response] = await analyticsClient.runReport({
                    property: `properties/${propertyId}`,
                    dateRanges: [{ startDate: '7daysAgo', endDate: 'today' }],
                    dimensions: [{ name: 'customEvent:query_content' }],
                    metrics: [{ name: 'eventCount' }],
                    dimensionFilter: {
                        filter: {
                            fieldName: 'eventName',
                            stringFilter: { value: 'user_query' }
                        }
                    }
                });

                insights = (response.rows || []).map(row => ({
                    query: row.dimensionValues[0].value,
                    count: parseInt(row.metricValues[0].value)
                }));
            } catch (error) {
                console.error("Error fetching GA4 insights:", error.message);
            }
        }
    }

    // If GA4 returned no results, use local log analysis
    if (insights.length === 0) {
        insights = getLocalInsights();
    }

    return insights.sort((a, b) => b.count - a.count).slice(0, 10);
}

/**
 * Uses Gemini to suggest a professional answer for a query.
 */
async function generateSuggestedAnswer(query, existingContext) {
    const rawKeys = process.env.GEMINI_API_KEY || "";
    const keys = rawKeys.split(',').map(k => k.replace(/['"]/g, '').trim()).filter(Boolean);
    
    if (keys.length === 0) return "API Key missing.";

    // Use a random key from the pool to avoid rate limits
    const selectedKey = keys[Math.floor(Math.random() * keys.length)];

    try {
        const genAI = new GoogleGenerativeAI(selectedKey);
        const model = genAI.getGenerativeModel({ model: "gemini-2.0-flash" });

        const prompt = `
            You are drafting a new entry for an Immigration Office Knowledge Base.
            The user frequently asks: "${query}"
            
            Current context available: 
            ${existingContext.substring(0, 2000)}
            
            Based on the context (if available) or general knowledge about Passport Administration, 
            write a concise, professional, and helpful answer for this question. 
            Format: Just the plain text answer.
        `;

        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (error) {
        console.error("Error generating suggested answer:", error.message);
        return "Gagal membuat saran jawaban otomatis.";
    }
}

/**
 * Analyzes unknown.txt to find high-frequency failed questions.
 */
function getTopUnknowns() {
    const filePath = path.join(__dirname, 'unknown.txt');
    if (!fs.existsSync(filePath)) return [];

    const data = fs.readFileSync(filePath, 'utf8').split("\n");
    const freq = {};
    data.forEach(q => {
        const clean = q.trim().toLowerCase();
        if (!clean || clean.length < 5) return;
        freq[clean] = (freq[clean] || 0) + 1;
    });

    return Object.entries(freq)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 10)
        .map(([query, count]) => ({ query, count }));
}

module.exports = {
    trackEvent,
    getInsights,
    generateSuggestedAnswer,
    getTopUnknowns
};
