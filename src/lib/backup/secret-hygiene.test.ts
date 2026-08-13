import fs from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";

describe("repository secret hygiene", () => {
  it.each([
    "repair_user.ts",
    "debug_user.ts",
    "prisma/seed.js",
    "prisma/seed_admin.js",
    "test-neis.js",
    "test-neis-standalone.js",
    "scripts/mobile-capture.mjs",
    "scripts/mobile-capture-key.mjs",
    "scripts/mobile-capture-pass2.mjs",
  ])("does not track the credential-bearing helper %s", async (relative) => {
    await expect(fs.lstat(path.resolve(relative))).rejects.toMatchObject({ code: "ENOENT" });
  });

  it("keeps full-history and directory scanning redacted and SHA-pinned", async () => {
    const workflow = await fs.readFile(path.resolve(".github/workflows/secret-scan.yml"), "utf8");
    const config = await fs.readFile(path.resolve(".gitleaks.toml"), "utf8");
    expect(workflow).toContain("fetch-depth: 0");
    expect(workflow).toContain("gitleaks git --redact");
    expect(workflow).toContain("gitleaks dir --redact");
    expect(workflow).toMatch(/uses: gitleaks\/gitleaks-action@[a-f0-9]{40}\b/u);
    expect(config).toContain("useDefault = true");
    expect(config).not.toMatch(/paths\s*=|commits\s*=/u);
  });
});
