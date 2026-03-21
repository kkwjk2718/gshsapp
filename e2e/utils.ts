import { expect, type Locator, type Page } from "@playwright/test";

function getRequiredEnv(name: string) {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required for E2E tests.`);
  }

  return value;
}

export function createTemporaryNoticeTitle() {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const suffix = Math.random().toString(36).slice(2, 8);
  return `[E2E] ${timestamp} ${suffix}`;
}

export async function assertNoApplicationError(page: Page) {
  await expect(page.locator("body")).not.toContainText("Application error");
  await expect(page.locator("body")).not.toContainText("Digest:");
}

export async function assertDesktopSidebarLayout(page: Page) {
  await expect(page.locator("aside")).toBeVisible();

  const metrics = await page.evaluate(() => {
    const aside = document.querySelector("aside");
    const firstLink = aside?.querySelector("nav a");

    if (!(aside instanceof HTMLElement) || !(firstLink instanceof HTMLElement)) {
      return null;
    }

    const asideRect = aside.getBoundingClientRect();
    const linkRect = firstLink.getBoundingClientRect();

    return {
      asideClientHeight: aside.clientHeight,
      asideScrollHeight: aside.scrollHeight,
      asideWidth: asideRect.width,
      linkWidth: linkRect.width,
    };
  });

  expect(metrics).not.toBeNull();

  if (!metrics) {
    return;
  }

  expect(metrics.asideScrollHeight).toBeLessThanOrEqual(metrics.asideClientHeight + 1);
  expect(metrics.linkWidth).toBeGreaterThanOrEqual(metrics.asideWidth * 0.78);
}

export async function loginAsAdmin(page: Page) {
  const userId = getRequiredEnv("E2E_ADMIN_USER");
  const password = getRequiredEnv("E2E_ADMIN_PASSWORD");

  await page.goto("/login");
  await expect(page.locator("#userId")).toBeVisible();
  await page.locator("#userId").fill(userId);
  await page.locator("#password").fill(password);

  await page.locator('button[type="submit"]').click();
  try {
    await page.waitForURL((url) => !url.pathname.endsWith("/login"), {
      timeout: 15_000,
    });
  } catch {
    const errorMessage = (await page.locator('[aria-live="polite"] p').first().textContent())?.trim();
    throw new Error(errorMessage || "Admin login did not complete successfully.");
  }

  await assertNoApplicationError(page);
}

export async function expectVisible(locator: Locator) {
  await expect(locator).toBeVisible();
}
