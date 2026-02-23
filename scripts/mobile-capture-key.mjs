import { chromium, devices } from 'playwright';
import fs from 'fs/promises';

const mode = process.argv[2] || 'after';
const outDir = `mobile-audit/${mode}`;
const baseURL = 'http://localhost:3000';
const routes = ['/', '/notices', '/meals', '/calendar', '/notifications', '/admin'];

(async () => {
  await fs.mkdir(outDir, { recursive: true });
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ ...devices['iPhone 14'] });
  const page = await context.newPage();
  for (const r of routes) {
    await page.goto(baseURL + r, { waitUntil: 'load', timeout: 20000 });
    await page.waitForTimeout(900);
    const name = r === '/' ? 'home' : r.replaceAll('/', '-').slice(1);
    await page.screenshot({ path: `${outDir}/${name}.png`, fullPage: true });
  }
  await browser.close();
})();