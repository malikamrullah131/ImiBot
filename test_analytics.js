const { BetaAnalyticsDataClient } = require('@google-analytics/data');
require('dotenv').config();

async function testAnalyticsCredentials() {
    console.log("=== Testing Analytics Credentials (Option 2) ===");
    
    const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON;
    
    if (!credentialsJson || credentialsJson.includes("...")) {
        console.error("❌ ERROR: Your GOOGLE_APPLICATION_CREDENTIALS_JSON in .env is still a placeholder.");
        console.log("Please copy the full JSON from your Google Cloud Service Account file into your .env as a single line.");
        return;
    }

    try {
        console.log("Attempting to parse JSON...");
        const credentials = JSON.parse(credentialsJson);
        
        console.log("Initializing Analytics Client with email:", credentials.client_email);
        
        const analyticsClient = new BetaAnalyticsDataClient({
            credentials: {
                client_email: credentials.client_email,
                private_key: credentials.private_key
            }
        });

        // Test a simple call (fetch reports)
        const propertyId = process.env.GA4_PROPERTY_ID;
        if (!propertyId) {
            console.error("❌ ERROR: GA4_PROPERTY_ID is missing from .env");
            return;
        }

        console.log("Fetching a test report from Property ID:", propertyId);
        const [response] = await analyticsClient.runReport({
            property: `properties/${propertyId}`,
            dateRanges: [{ startDate: 'today', endDate: 'today' }],
            dimensions: [{ name: 'eventName' }],
            metrics: [{ name: 'eventCount' }],
            limit: 1
        });

        console.log("✅ SUCCESS! Credentials are valid.");
        console.log("Report returned rows:", response.rows ? response.rows.length : 0);

    } catch (error) {
        console.error("❌ FAILED!");
        console.error("Error Message:", error.message);
        if (error.code === 401 || error.code === 403) {
            console.error("Reason: Authentication or permission issue. Make sure your service account email is added to your GA4 property.");
        }
    }
}

testAnalyticsCredentials();
