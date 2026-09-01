import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const protectedDataPages = [
  "src/app/(main)/admin/page.tsx",
  "src/app/(main)/admin/categories/page.tsx",
  "src/app/(main)/admin/notices/page.tsx",
  "src/app/(main)/admin/notices/new/page.tsx",
  "src/app/(main)/admin/notices/[id]/edit/page.tsx",
  "src/app/(main)/admin/settings/page.tsx",
  "src/app/(main)/admin/sites/page.tsx",
  "src/app/(main)/admin/songs/page.tsx",
  "src/app/(main)/admin/tokens/page.tsx",
  "src/app/(main)/admin/tokens/[batchId]/page.tsx",
  "src/app/(main)/admin/users/page.tsx",
] as const;

describe("admin page data authorization", () => {
  it.each(protectedDataPages)("checks the current database-backed admin session before reading %s", (file) => {
    const source = readFileSync(join(process.cwd(), file), "utf8");
    expect(source).toContain('from "@/lib/current-user"');
    expect(source).toMatch(/await requireAdmin\(\)/u);

    const authorization = source.indexOf("await requireAdmin()");
    const firstDatabaseRead = source.search(/(?:prisma\.|loadNoticeCategories\(|loadSettingsPageData\()/u);
    expect(authorization).toBeGreaterThanOrEqual(0);
    expect(firstDatabaseRead).toBeGreaterThan(authorization);
  });
});
