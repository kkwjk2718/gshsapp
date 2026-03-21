import { test, expect, type Page } from "@playwright/test";
import { assertDesktopSidebarLayout, assertNoApplicationError, openDesktopSidebar } from "./utils";

async function getHomeLayoutMetrics(page: Page) {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-testid="home-content-shell"]');
    const main = document.querySelector('[data-testid="home-main-grid"]');

    if (!(shell instanceof HTMLElement) || !(main instanceof HTMLElement)) {
      return null;
    }

    const shellRect = shell.getBoundingClientRect();
    const mainRect = main.getBoundingClientRect();

    return {
      viewportWidth: window.innerWidth,
      shellWidth: Math.round(shellRect.width),
      mainWidth: Math.round(mainRect.width),
      leftGap: Math.round(shellRect.left),
      rightGap: Math.round(window.innerWidth - shellRect.right),
      hasHorizontalOverflow: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });
}

test("public routes render without server errors @smoke", async ({ page }) => {
  await page.setViewportSize({ width: 1366, height: 768 });

  await page.goto("/");
  await expect(page.locator("body")).toContainText("GSHS.app");
  await expect(page.getByTestId("desktop-home-meta")).toBeVisible();
  await expect(page.getByTestId("desktop-home-weather")).toBeVisible();
  await expect(page.getByTestId("desktop-header-notifications")).toBeVisible();
  await expect(page.getByTestId("desktop-utility-login-link")).toBeVisible();
  await expect(page.locator("main h1").filter({ hasText: "GSHS.app" })).toHaveCount(0);
  const hdMetrics = await getHomeLayoutMetrics(page);
  expect(hdMetrics).not.toBeNull();
  expect(hdMetrics?.hasHorizontalOverflow).toBeFalsy();
  expect(hdMetrics?.shellWidth ?? 0).toBeGreaterThan(900);
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

test("home layout uses wider content area on FHD screens", async ({ page }) => {
  await page.setViewportSize({ width: 1920, height: 1080 });

  await page.goto("/");
  await expect(page.locator("body")).toContainText("GSHS.app");

  const fhdMetrics = await getHomeLayoutMetrics(page);
  expect(fhdMetrics).not.toBeNull();

  if (!fhdMetrics) {
    return;
  }

  expect(fhdMetrics.hasHorizontalOverflow).toBeFalsy();
  expect(fhdMetrics.shellWidth).toBeGreaterThan(1200);
  expect(fhdMetrics.mainWidth).toBeGreaterThan(1200);
  expect(fhdMetrics.leftGap).toBeLessThan(360);
  expect(fhdMetrics.rightGap).toBeLessThan(360);
  await assertNoApplicationError(page);
});
