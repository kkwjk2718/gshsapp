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

export async function loginAsAdmin(page: Page) {
  const userId = getRequiredEnv("E2E_ADMIN_USER");
  const password = getRequiredEnv("E2E_ADMIN_PASSWORD");

  await page.goto("/login");
  await expect(page.locator("#userId")).toBeVisible();
  await page.locator("#userId").fill(userId);
  await page.locator("#password").fill(password);

  await page.locator('button[type="submit"]').click();
  await page.waitForLoadState("networkidle");

  if (new URL(page.url()).pathname.endsWith("/login")) {
    const errorMessage = (await page.locator('[aria-live="polite"] p').first().textContent())?.trim();
    throw new Error(errorMessage || "Admin login did not complete successfully.");
  }

  await assertNoApplicationError(page);
}

export async function expectVisible(locator: Locator) {
  await expect(locator).toBeVisible();
}
