import { chromium, devices } from 'playwright';

const baseURL = 'http://localhost:3000';
const pw = 'Test1234!';

const accounts = {
  student: { userId: 'e2e_student', password: pw },
  teacher: { userId: 'e2e_teacher', password: pw },
  admin: { userId: 'e2e_admin', password: pw },
};

const results = [];
const push = (name, ok, note='') => results.push({ name, ok, note });

async function login(page, creds) {
  await page.goto(`${baseURL}/login`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  await page.fill('input[name="userId"]', creds.userId);
  await page.fill('input[name="password"]', creds.password);
  await page.click('button[type="submit"]');
  await page.waitForTimeout(1200);
}

async function routeCheck(page, path, label) {
  try {
    await page.goto(`${baseURL}${path}`, { waitUntil: 'domcontentloaded', timeout: 15000 });
    await page.waitForTimeout(300);
    push(label, true, `url=${page.url()}`);
  } catch (e) {
    push(label, false, String(e));
  }
}

async function suite(name, device) {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext(device ? { ...device } : { viewport: { width: 1366, height: 900 } });

  const p0 = await context.newPage();
  await p0.goto(`${baseURL}/admin`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  push(`${name}: unauth /admin blocked`, !p0.url().includes('/admin') || p0.url().includes('/login'), `url=${p0.url()}`);

  await p0.goto(`${baseURL}/me`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  push(`${name}: unauth /me blocked`, !p0.url().includes('/me') || p0.url().includes('/login'), `url=${p0.url()}`);
  await p0.close();

  const ps = await context.newPage();
  await login(ps, accounts.student);
  push(`${name}: student login`, !ps.url().includes('/login'), `url=${ps.url()}`);

  for (const [path, label] of [
    ['/', 'home'], ['/notices', 'notices'], ['/meals', 'meals'], ['/timetable', 'timetable'],
    ['/calendar', 'calendar'], ['/links', 'links'], ['/sites', 'sites'], ['/songs', 'songs'],
    ['/notifications', 'notifications'], ['/report', 'report'], ['/me', 'me'], ['/utils', 'utils'],
  ]) await routeCheck(ps, path, `${name}: student ${label}`);

  await ps.goto(`${baseURL}/admin`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  push(`${name}: student admin blocked`, !ps.url().includes('/admin') || ps.url().includes('/login'), `url=${ps.url()}`);
  await ps.close();

  const pt = await context.newPage();
  await login(pt, accounts.teacher);
  await pt.goto(`${baseURL}/admin`, { waitUntil: 'domcontentloaded', timeout: 15000 });
  push(`${name}: teacher admin blocked`, !pt.url().includes('/admin') || pt.url().includes('/login'), `url=${pt.url()}`);
  await pt.close();

  const pa = await context.newPage();
  await login(pa, accounts.admin);
  push(`${name}: admin login`, !pa.url().includes('/login'), `url=${pa.url()}`);

  for (const [path, label] of [
    ['/admin', 'admin dashboard'], ['/admin/users', 'admin users'], ['/admin/notices', 'admin notices'],
    ['/admin/categories', 'admin categories'], ['/admin/tokens', 'admin tokens'], ['/admin/logs', 'admin logs'],
    ['/admin/reports', 'admin reports'], ['/admin/settings', 'admin settings'], ['/admin/notifications', 'admin notifications'],
    ['/admin/songs', 'admin songs'], ['/admin/sites', 'admin sites']
  ]) await routeCheck(pa, path, `${name}: ${label}`);

  await pa.close();
  await browser.close();
}

await suite('Desktop', null);
await suite('Mobile', devices['iPhone 13']);

console.log(JSON.stringify(results, null, 2));
