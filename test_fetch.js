async function testFetch() {
    try {
        console.log("Testing Pollinations via fetch...");
        const res = await fetch("https://text.pollinations.ai/hello", { redirect: 'follow' });
        console.log("Status:", res.status);
        const text = await res.text();
        console.log("Response:", text.substring(0, 200));
    } catch (e) {
        console.error("Error:", e.message);
    }
}

testFetch();
