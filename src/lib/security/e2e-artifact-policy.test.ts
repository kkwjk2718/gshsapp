import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const remoteWorkflows = [
  ".github/workflows/publish-and-deploy-test.yml",
  ".github/workflows/preproduction-rehearsal.yml",
  ".github/workflows/deploy-prod.yml",
];

describe("secret-bearing E2E artifact policy", () => {
  it("disables browser recordings and HTML reports in CI", () => {
    const config = readFileSync(join(root, "playwright.config.ts"), "utf8");
    expect(config).toContain('trace: "off"');
    expect(config).toContain('screenshot: "off"');
    expect(config).toContain('video: "off"');
    expect(config).toContain('reporter: process.env.CI ? [["list"]]');
  });

  it.each(remoteWorkflows)("never publishes raw Playwright output from %s", (workflow) => {
    const source = readFileSync(join(root, workflow), "utf8");
    expect(source).toContain("E2E_ADMIN_PASSWORD:");
    expect(source).not.toMatch(/playwright-report-(?:test|preproduction|production)/u);
    expect(source).not.toMatch(/path:\s*[|>-]?\s*\n\s*(?:playwright-report|test-results)/u);
  });
});
