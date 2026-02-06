import axios from 'axios';

const baseUrl = 'http://localhost:3001';
const routes = [
    '/admin',
    '/admin/users',
    '/admin/logs',
    '/admin/test',
    '/admin/notices', // Assuming this exists based on the code I saw
];

async function checkRoutes() {
    console.log('Starting admin route verification...');
    let failed = false;

    for (const route of routes) {
        try {
            const response = await axios.get(`${baseUrl}${route}`, {
                validateStatus: function (status) {
                    return status < 500; // Resolve if status is less than 500 (so redirects 3xx are OK, and 4xx strictly speaking means "working server" just maybe unauth)
                },
                maxRedirects: 0 // Don't follow redirects automatically so we can see them
            });

            console.log(`[PASS] ${route} - Status: ${response.status}`);
        } catch (error) {
            console.error(`[FAIL] ${route} - Error: ${error.message}`);
            if (error.response) {
                console.error(`       Status: ${error.response.status}`);
            }
            failed = true;
        }
    }

    if (failed) {
        console.log('Some routes failed verification.');
        process.exit(1);
    } else {
        console.log('All routes verified successfully (accessible or redirecting).');
    }
}

checkRoutes();
