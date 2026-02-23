import { chromium, devices } from 'playwright';
import fs from 'fs/promises';

const baseURL = 'http://localhost:3000';
const outDir = 'mobile-audit/pass2';

const pages = [
  { path: '/utils', name: 'utils' },
  { path: '/utils/byte-calculator', name: 'utils-byte-calculator' },
  { path: '/utils/random-number', name: 'utils-random-number' },
  { path: '/utils/seat-arrangement', name: 'utils-seat-arrangement' },
  { path: '/teachers', name: 'teachers' },
  { path: '/links', name: 'links' },
  { path: '/sites', name: 'sites' },
  { path: '/report', name: 'report' },
  { path: '/privacy', name: 'privacy' },
  { path: '/help', name: 'help' },
  { path: '/menu', name: 'menu' },
];

const ensureDir = async (dir) => fs.mkdir(dir, { recursive: true });

async function setTheme(page, theme) {
  await page.addInitScript((mode) => {
    localStorage.setItem('theme', mode);
  }, theme);
}

async function login(page) {
  await page.goto(`${baseURL}/login`, { waitUntil: 'load' });
  const idInput = page.locator('#userId');
  if (await idInput.count()) {
    await idInput.fill('student');
    await page.locator('#password').fill('password');
    await page.getByRole('button', { name: '로그인' }).click();
    await page.waitForTimeout(1200);
  }
}

async function captureSet({ auth, theme }) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 14'],
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul'
  });
  const page = await context.newPage();
  await setTheme(page, theme);

  if (auth) await login(page);

  for (const item of pages) {
    await page.goto(`${baseURL}${item.path}`, { waitUntil: 'load' });
    await page.waitForTimeout(700);
    const label = `${auth ? 'auth' : 'guest'}-${theme}`;
    await page.screenshot({ path: `${outDir}/${item.name}-${label}.png`, fullPage: true });
  }

  await browser.close();
}

(async () => {
  await ensureDir(outDir);
  await captureSet({ auth: false, theme: 'light' });
  await captureSet({ auth: false, theme: 'dark' });
  await captureSet({ auth: true, theme: 'light' });
  await captureSet({ auth: true, theme: 'dark' });
})();
