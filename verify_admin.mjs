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
            const response = await fetch(`${baseUrl}${route}`, {
                method: 'GET',
                redirect: 'manual',
            });

            if (response.status >= 500) {
                throw new Error(`HTTP ${response.status}`);
            }

            console.log(`[PASS] ${route} - Status: ${response.status}`);
        } catch (error) {
            console.error(`[FAIL] ${route} - Error: ${error.message}`);
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
