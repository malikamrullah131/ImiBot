const axios = require('axios');

/**
 * 1. Mesin Pencari DuckDuckGo (Scraping Ringan / HTML)
 * 100% Gratis - Tanpa API Key.
 */
async function searchDuckDuckGo(query) {
    try {
        console.log(`[Search] Mencari di DuckDuckGo: ${query}`);
        const response = await axios.get(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, {
            headers: {
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
            }
        });
        
        // Ekstrak snippet dengan Regex murni tanpa lib spesifik (agar enteng)
        const html = response.data;
        const results = [];
        
        const snippetRegex = /<a class="result__snippet[^>]*>(.*?)<\/a>/gi;
        let match;
        // Ambil top 5 hasil
        while ((match = snippetRegex.exec(html)) !== null && results.length < 5) {
            // Hapus sisa-sisa Tag HTML (<b>, </b>, dst)
            let text = match[1].replace(/<\/?[^>]+(>|$)/g, ""); 
            // Decode entity kecil-kecilan
            text = text.replace(/&#x27;/g, "'").replace(/&quot;/g, '"');
            if (text.trim()) results.push(text.trim());
        }
        
        return results;
    } catch (error) {
        console.error("[DuckDuckGo Error]", error.message);
        return [];
    }
}

/**
 * 2. API SearxNG Lokal (Self-Hosted Metasearch)
 * Syarat: Install SearxNG dengan Docker dan arahkan localhost URL Anda ke sini.
 * Gratis Tanpa Batas Kuota (Metasearch Engine mandiri).
 */
async function searchSearxNG(query, searxngUrl = "http://localhost:8080") {
    try {
        console.log(`[Search] Mencari via SearxNG: ${query}`);
        const response = await axios.get(`${searxngUrl}/search`, {
            params: {
                q: query,
                format: 'json',
                language: 'id-ID'
            }
        });
        
        if (response.data && response.data.results) {
            // Ekstrak snippet jawaban/konten ke dalam Array
            return response.data.results.slice(0, 5).map(res => res.content || res.snippet || "");
        }
        return [];
    } catch (error) {
        console.error("[SearxNG Error] Pastikan container SearxNG sudah running di", searxngUrl);
        return [];
    }
}

/**
 * 3. Serper.dev (Google API Proxy Alternatif Terpopuler)
 * Free tier: 2.500 pencarian secara instan.
 */
async function searchSerperDev(query, apiKey=process.env.SERPER_API_KEY) {
    if (!apiKey) throw new Error("SERPER_API_KEY belum di-set di file .env");
    
    try {
        console.log(`[Search] Mencari via Serper.dev: ${query}`);
        const data = JSON.stringify({ "q": query, "gl": "id", "hl": "id" });
        const config = {
            method: 'post',
            url: 'https://google.serper.dev/search',
            headers: { 
                'X-API-KEY': apiKey, 
                'Content-Type': 'application/json'
            },
            data : data
        };

        const response = await axios(config);
        const organic = response.data.organic || [];
        return organic.slice(0, 5).map(item => item.snippet);
    } catch (error) {
        console.error("[Serper Error]", error.response?.data || error.message);
        return [];
    }
}

/**
 * 4. Tavily API (Search Engine Khusus AI Agent / LLM)
 * Free Tier: 1.000 pencarian per bulan
 * Cepat untuk bot berbasis teks (rag).
 */
async function searchTavily(query, apiKey=process.env.TAVILY_API_KEY) {
    if (!apiKey) throw new Error("TAVILY_API_KEY belum di-set di file .env");

    try {
        console.log(`[Search] Mencari via Tavily API: ${query}`);
        const response = await axios.post("https://api.tavily.com/search", {
            api_key: apiKey,
            query: query,
            search_depth: "basic",
            include_answer: false, // Tidak butuh AI gen dari dia, hanya hasil search raw
            max_results: 5
        });

        return response.data.results.map(res => res.content);
    } catch (error) {
        console.error("[Tavily Error]", error.response?.data || error.message);
        return [];
    }
}

/**
 * 5. Brave Search API (Pengganti Google yang Ramah Web3/AI)
 * Free tier: 2.000 pencarian per bulan.
 */
async function searchBrave(query, apiKey=process.env.BRAVE_API_KEY) {
    if (!apiKey) throw new Error("BRAVE_API_KEY belum di-set di file .env");

    try {
        console.log(`[Search] Mencari via Brave Search API: ${query}`);
        const response = await axios.get("https://api.search.brave.com/res/v1/web/search", {
            params: { q: query },
            headers: {
                "Accept": "application/json",
                "X-Subscription-Token": apiKey
            }
        });

        const webResults = response.data?.web?.results || [];
        return webResults.slice(0, 5).map(res => res.description);
    } catch (error) {
        console.error("[Brave Search Error]", error.response?.data || error.message);
        return [];
    }
}

// Fungsi Pintu Masuk / Switch untuk dieksekusi oleh AI Bot Anda nantinya
async function executeWebSearch(query, provider = "duckduckgo") {
    let results = [];
    switch (provider.toLowerCase()) {
        case "duckduckgo":
            results = await searchDuckDuckGo(query);    break;
        case "searxng":
            results = await searchSearxNG(query);       break;
        case "serper":
            results = await searchSerperDev(query);     break;
        case "tavily":
            results = await searchTavily(query);        break;
        case "brave":
            results = await searchBrave(query);         break;
        default:
            console.log(`Provider ${provider} tidak ditemukan, jatuh kembali ke mode DuckDuckGo.`);
            results = await searchDuckDuckGo(query);
    }
    return results;
}

// ================= PENGUJIAN LOKAL ================= //
// Area ini akan dijalankan jika Anda mengetik `node search_providers.js` di terminal
if (require.main === module) {
    // Panggil env config agar membaca kunci API .env
    require('dotenv').config();
    const testQuery = "Berapa biaya paspor elektronik baru di tahun 2026?";

    (async () => {
        console.log("=== Menguji Modul Web Search AI ===");
        
        console.log("\n1. Testing DuckDuckGo:");
        const ddgResults = await executeWebSearch(testQuery, "duckduckgo");
        console.log("-> Hasil DuckDuckGo:\n   " + ddgResults.join("\n   "));
        
        /* 
         * [HAPUS COMMENT SEBELUM DI UJI COBA] 
         * Jika Anda punya API key, pastikan set key-nya di .env dan buka block ini 
         */
        
        // console.log("\n2. Testing Serper.dev:");
        // const serpResults = await executeWebSearch(testQuery, "serper");
        // console.log("-> Hasil Serper:\n   " + serpResults.join("\n   "));

        // console.log("\n3. Testing Tavily:");
        // const tavResults = await executeWebSearch(testQuery, "tavily");
        // console.log("-> Hasil Tavily:\n   " + tavResults.join("\n   "));
        
        // console.log("\n4. Testing Brave Search:");
        // const braveResults = await executeWebSearch(testQuery, "brave");
        // console.log("-> Hasil Brave:\n   " + braveResults.join("\n   "));
    })();
}

module.exports = {
    searchDuckDuckGo,
    searchSearxNG,
    searchSerperDev,
    searchTavily,
    searchBrave,
    executeWebSearch
};
