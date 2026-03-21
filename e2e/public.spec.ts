import { test, expect } from "@playwright/test";
import { assertDesktopSidebarLayout, assertNoApplicationError, openDesktopSidebar } from "./utils";

test("public routes render without server errors @smoke", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });

  await page.goto("/");
  await expect(page.locator("body")).toContainText("GSHS.app");
  await expect(page.getByTestId("desktop-home-meta")).toBeVisible();
  await expect(page.getByTestId("desktop-home-weather")).toBeVisible();
  await expect(page.getByTestId("desktop-header-notifications")).toBeVisible();
  await expect(page.getByTestId("desktop-utility-login-link")).toBeVisible();
  await expect(page.locator("main h1").filter({ hasText: "GSHS.app" })).toHaveCount(0);
  await assertDesktopSidebarLayout(page);
  await assertNoApplicationError(page);

  await openDesktopSidebar(page);
  await page.getByRole("link", { name: "공지사항" }).click();
  await expect(page).toHaveURL(/\/notices$/);
  await expect(page.getByTestId("desktop-sidebar-drawer")).toHaveCount(0);
  await expect(page.locator("main")).toBeVisible();
  await expect(page.getByTestId("desktop-home-meta")).toHaveCount(0);
  await expect(page.getByTestId("desktop-home-weather")).toHaveCount(0);
  await expect(page.getByTestId("desktop-header-notifications")).toBeVisible();
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
