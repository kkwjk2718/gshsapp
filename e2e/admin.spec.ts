import { test, expect } from "@playwright/test";
import { assertNoApplicationError, loginAsAdmin } from "./utils";

const expectedReadinessChecks = [
  "Runtime Version",
  "Backup Directory Writable",
  "Latest Backup Freshness",
  "Disk Free Space",
  "Database Path Configuration",
];

test("admin settings and diagnostics stay healthy after deploy @smoke", async ({ page }) => {
  test.setTimeout(90_000);

  await loginAsAdmin(page);

  await page.goto("/");
  await expect(page.getByTestId("sidebar-user-link")).toBeVisible();
  await expect(page.getByTestId("home-welcome-authenticated")).toBeVisible();
  await expect(page.getByTestId("home-timetable-authenticated")).toBeVisible();
  await assertNoApplicationError(page);

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/admin$/);
  await assertNoApplicationError(page);

  await page.goto("/admin/settings");
  await expect(page.locator('[data-testid="google-analytics-id-input"], input[name="googleAnalyticsId"]')).toBeVisible();
  await assertNoApplicationError(page);

  await page.goto("/admin/test");
  await expect(page.getByTestId("run-system-tests")).toBeVisible();
  await assertNoApplicationError(page);

  await page.getByTestId("run-system-tests").click();
  await expect(page.getByTestId("run-system-tests")).toBeEnabled({ timeout: 90_000 });

  await expect
    .poll(async () => page.getByTestId("system-test-result").count(), {
      timeout: 90_000,
      message: "expected the diagnostics page to render all system test results",
    })
    .toBeGreaterThanOrEqual(11);

  await expect(page.locator('[data-testid="system-test-result"][data-status="FAIL"]')).toHaveCount(0);

  for (const checkName of expectedReadinessChecks) {
    await expect(page.locator(`[data-testid="system-test-result"][data-test-name="${checkName}"]`)).toBeVisible();
  }
});
