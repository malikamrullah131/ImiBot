const axios = require('axios');
const config = require('../config');

const OLLAMA_BASE_URL = process.env.OLLAMA_URL || 'http://localhost:11434';

/**
 * 🏠 Ollama Chat Wrapper — Supports system + user prompt (proper role model)
 * Tries /api/chat first (cleaner), falls back to /api/generate.
 *
 * @param {string} modelName  - e.g. "phi3:mini"
 * @param {string} systemPrompt - The system instruction for the model
 * @param {string} userPrompt   - The actual user message / task
 * @returns {Promise<string>}
 */
async function getOllamaResponse(modelName, systemPrompt, userPrompt) {
    const model = modelName || config.localModels.primary || 'phi3:mini';
    const timeout = config.performance.llmTimeoutMs || 25000;
    const numCtx = config.performance.localContextLimit || 2048;

    // --- ATTEMPT 1: /api/chat (Preferred — supports system role) ---
    try {
        const res = await axios.post(`${OLLAMA_BASE_URL}/api/chat`, {
            model,
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user',   content: userPrompt }
            ],
            stream: false,
            options: { num_ctx: numCtx }
        }, { timeout });

        const content = res.data?.message?.content;
        if (content && content.length > 0) {
            console.log(`[🏠 OLLAMA/chat] Respon diterima dari model "${model}".`);
            return content;
        }
        throw new Error('Empty response from /api/chat');
    } catch (chatErr) {
        console.warn(`[🏠 OLLAMA/chat] Gagal (${chatErr.message}), mencoba /api/generate...`);
    }

    // --- ATTEMPT 2: /api/generate (Legacy fallback) ---
    const combinedPrompt = systemPrompt
        ? `[SISTEM]: ${systemPrompt}\n\n[TUGAS]: ${userPrompt}`
        : userPrompt;

    const res = await axios.post(`${OLLAMA_BASE_URL}/api/generate`, {
        model,
        prompt: combinedPrompt,
        stream: false,
        options: { num_ctx: numCtx }
    }, { timeout });

    const response = res.data?.response;
    if (!response) throw new Error('Empty response from /api/generate');

    console.log(`[🏠 OLLAMA/generate] Respon diterima dari model "${model}".`);
    return response;
}

/**
 * Quick health check — returns true if Ollama is reachable.
 */
async function isOllamaAlive() {
    try {
        await axios.get(`${OLLAMA_BASE_URL}/api/tags`, { timeout: 3000 });
        return true;
    } catch {
        return false;
    }
}

module.exports = { getOllamaResponse, isOllamaAlive };
