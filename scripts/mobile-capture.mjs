import { chromium, devices } from 'playwright';
import fs from 'fs/promises';

const baseURL = 'http://localhost:3000';
const mode = process.argv[2] || 'before';
const outDir = `mobile-audit/${mode}`;

const pages = [
  { path: '/', name: 'home' },
  { path: '/login', name: 'login' },
  { path: '/signup', name: 'signup' },
  { path: '/notices', name: 'notices' },
  { path: '/meals', name: 'meals' },
  { path: '/songs', name: 'songs' },
  { path: '/timetable', name: 'timetable' },
  { path: '/calendar', name: 'calendar' },
  { path: '/me', name: 'me' },
  { path: '/notifications', name: 'notifications' },
  { path: '/admin', name: 'admin' },
  { path: '/admin/notices', name: 'admin-notices' },
  { path: '/admin/users', name: 'admin-users' }
];

const ensureDir = async (dir) => fs.mkdir(dir, { recursive: true });

const isLoginPage = (url) => url.includes('/login');

(async () => {
  await ensureDir(outDir);
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    ...devices['iPhone 14'],
    locale: 'ko-KR',
    timezoneId: 'Asia/Seoul'
  });

  const page = await context.newPage();

  // Login for protected routes
  await page.goto(`${baseURL}/login`, { waitUntil: 'load' });
  const idInput = page.locator('#userId');
  if (await idInput.count()) {
    await idInput.fill('student');
    await page.locator('#password').fill('password');
    await page.getByRole('button', { name: '로그인' }).click();
    await page.waitForTimeout(1500);
  }

  for (const item of pages) {
    await page.goto(`${baseURL}${item.path}`, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // if redirected to login for auth routes, keep as evidence
    const current = page.url();
    if (isLoginPage(current) && !item.path.includes('login') && !item.path.includes('signup')) {
      await page.screenshot({ path: `${outDir}/${item.name}-auth-required.png`, fullPage: true });
      continue;
    }

    await page.screenshot({ path: `${outDir}/${item.name}.png`, fullPage: true });
  }

  await browser.close();
})();
