import { test, expect } from "@playwright/test";
import { assertNoApplicationError, createTemporaryNoticeTitle, loginAsAdmin } from "./utils";

test("admin can create, verify, and remove a temporary notice", async ({ page }) => {
  test.setTimeout(90_000);

  const title = createTemporaryNoticeTitle();
  const content = `Temporary E2E notice body for ${title}`;
  let createdNotice = false;

  await loginAsAdmin(page);

  try {
    await page.goto("/admin/notices/new");
    await page.locator('[data-testid="notice-title-input"], input[name="title"]').fill(title);
    await page.locator('[data-testid="notice-content-input"], textarea[name="content"]').fill(content);
    await page.locator('[data-testid="submit-notice-button"], button[type="submit"]').click();

    await page.waitForURL(/\/admin\/notices$/);
    await expect(page.locator("tbody tr").first()).toContainText(title);
    await assertNoApplicationError(page);
    createdNotice = true;

    await page.goto("/notices");
    const publicNoticeLink = page.locator('a[href^="/notices/"]').filter({ hasText: title }).first();
    await expect(publicNoticeLink).toBeVisible();
    await publicNoticeLink.click();

    await expect(page).toHaveURL(/\/notices\/.+/);
    await expect(page.locator("h1")).toContainText(title);
    await expect(page.locator("body")).toContainText(content);
    await assertNoApplicationError(page);
  } finally {
    if (!createdNotice) {
      return;
    }

    await page.goto("/admin/notices");
    const noticeRow = page.locator("tbody tr").filter({ hasText: title }).first();

    if ((await noticeRow.count()) === 0) {
      return;
    }

    await noticeRow.locator("button[aria-label]").click();
    await expect(page.locator("tbody tr").filter({ hasText: title })).toHaveCount(0);
  }
});
