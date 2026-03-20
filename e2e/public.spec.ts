import { test, expect } from "@playwright/test";
import { assertNoApplicationError } from "./utils";

test("public routes render without server errors @smoke", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("body")).toContainText("GSHS.app");
  await assertNoApplicationError(page);

  await page.goto("/notices");
  await expect(page.locator("main")).toBeVisible();
  if ((await page.locator('a[href^="/notices/"]').count()) > 0) {
    await expect(page.locator('a[href^="/notices/"]').first()).toBeVisible();
  }
  await assertNoApplicationError(page);

  await page.goto("/meals");
  await expect(page.locator('a[href*="/meals?date="]')).toHaveCount(2);
  await assertNoApplicationError(page);

  await page.goto("/calendar");
  await expect
    .poll(async () => page.locator("main button").count(), {
      timeout: 15_000,
      message: "expected the calendar page to render navigation controls",
    })
    .toBeGreaterThanOrEqual(3);
  await assertNoApplicationError(page);

  await page.goto("/menu");
  await expect(page.locator('a[href="/meals"]').first()).toBeVisible();
  await assertNoApplicationError(page);

  await page.goto("/login");
  await expect(page.locator("#userId")).toBeVisible();
  await expect(page.locator("#password")).toBeVisible();
  await assertNoApplicationError(page);
});
