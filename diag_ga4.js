const { BetaAnalyticsDataClient } = require('@google-analytics/data');
require('dotenv').config();

async function check() {
    const credentials = JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON);
    const analyticsClient = new BetaAnalyticsDataClient({ credentials });
    const propertyId = process.env.GA4_PROPERTY_ID;

    try {
        await analyticsClient.runReport({
             property: `properties/${propertyId}`,
             dateRanges: [{ startDate: 'today', endDate: 'today' }],
             dimensions: [{ name: 'eventName' }],
             metrics: [{ name: 'eventCount' }],
             limit: 1
        });
        console.log("SUCCESS");
    } catch (e) {
        console.log("ERROR_CODE: " + e.code);
        console.log("ERROR_MESSAGE: " + e.message);
    }
}
check();
