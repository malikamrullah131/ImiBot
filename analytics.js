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
 * Uses DeepSeek R-1 (via OpenRouter) or Gemini to suggest a professional answer.
 */
async function generateSuggestedAnswer(query, existingContext) {
    const promptText = `
        Kamu adalah petugas Humas Imigrasi yang profesional.
        Warga sering menanyakan pertanyaan ini: "${query}"
        
        Konteks referensi (bila relevan): 
        ${existingContext.substring(0, 1500)}
        
        Berdasarkan informasi di atas (atau pengetahuan imigrasi umum), buatkan DRAF JAWABAN yang sangat singkat, jelas, ramah, dan solutif.
        Jangan menggunakan format penjelasan. Berikan langsung jawaban murni yang akan dikirim ke WhatsApp warga.
    `;

    // 1. PRIORITAS UTAMA: Gunakan OpenRouter (Gratis: Deepseek-R1 / Llama 3)
    const openRouterKey = process.env.OPENROUTER_API_KEY;
    if (openRouterKey) {
        try {
            console.log("[AI] Meminta saran dari Model Alternatif (OpenRouter/DeepSeek R-1)...");
            const response = await axios.post("https://openrouter.ai/api/v1/chat/completions", {
                "model": "deepseek/deepseek-r1:free", // Bisa diganti ke meta-llama/llama-3-8b-instruct:free
                "messages": [
                    { "role": "system", "content": "Kamu adalah asisten Imigrasi. Jawab dengan cerdas dan ringkas tanpa penjelasan panjang." },
                    { "role": "user", "content": promptText }
                ]
            }, {
                headers: {
                    "Authorization": `Bearer ${openRouterKey.trim()}`,
                    "Content-Type": "application/json"
                }
            });

            // DeepSeek R-1 memisahkan <think> tag, jadi kita hapus blok think jika ada.
            let reply = response.data.choices[0].message.content;
            reply = reply.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
            return reply;
        } catch (error) {
            console.error("[AI Error] OpenRouter gagal:", error.response ? error.response.data : error.message);
        }
    }

    // 2. FALLBACK (Metode Cadangan): Gunakan Gemini jika OpenRouter tidak ada/limit
    const rawKeys = process.env.GEMINI_API_KEY || "";
    const keys = rawKeys.split(',').map(k => k.replace(/['"]/g, '').trim()).filter(Boolean);
    
    if (keys.length === 0) return "Gagal mendapatkan saran. Semua kuota API habis (Memerlukan API Key Baru atau OpenRouter).";

    const selectedKey = keys[Math.floor(Math.random() * keys.length)];
    try {
        console.log("[AI] Fallback ke Gemini API untuk saran jawaban...");
        const genAI = new GoogleGenerativeAI(selectedKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" }); // Fast and cheap
        const result = await model.generateContent(promptText);
        return result.response.text().trim();
    } catch (error) {
        console.error("Error generating suggested answer via Gemini:", error.message);
        return "Terjadi kesalahan internal. Limit AI Tercapai atau Kuota Habis. Pertimbangkan menggunakan OpenRouter (Deepseek Gratis).";
    }
}

/**
 * Suggests the most appropriate category for a given query based on predefined categories.
 */
async function suggestCategory(query) {
    const categories = ["Paspor", "M-Paspor", "Lokasi & Jadwal", "Biaya", "SOP & Prosedur", "Lainnya"];
    const promptText = `
        Kategorikan pertanyaan warga berikut ke dalam salah satu kategori ini: ${categories.join(', ')}.
        Pertanyaan: "${query}"
        
        Berikan HANYA nama kategorinya saja tanpa penjelasan apapun.
    `;

    const rawKeys = process.env.GEMINI_API_KEY || "";
    const keys = rawKeys.split(',').map(k => k.replace(/['"]/g, '').trim()).filter(Boolean);
    if (keys.length === 0) return "Lainnya";

    const selectedKey = keys[Math.floor(Math.random() * keys.length)];
    try {
        const genAI = new GoogleGenerativeAI(selectedKey);
        const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
        const result = await model.generateContent(promptText);
        let category = result.response.text().trim();
        
        // Match against whitelist
        const match = categories.find(c => category.toLowerCase().includes(c.toLowerCase()));
        return match || "Lainnya";
    } catch (e) {
        return "Lainnya";
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

/**
 * Triggers a Webhook (Zapier/Make.com) for external automation.
 */
async function triggerWebhook(data) {
    const webhookUrl = process.env.ZAPIER_WEBHOOK_URL;
    if (!webhookUrl) return;

    try {
        await axios.post(webhookUrl, {
            ...data,
            bot_name: "ImmiCare Bot",
            timestamp: new Date().toISOString()
        });
        console.log("[Otomasi] Data terkirim ke Zapier.");
    } catch (e) {
        console.error("[Otomasi] Gagal mengirim ke Zapier:", e.message);
    }
}

module.exports = {
    trackEvent,
    getInsights,
    generateSuggestedAnswer,
    suggestCategory,
    getTopUnknowns,
    triggerWebhook
};
