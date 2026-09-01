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

  it.each(remoteWorkflows)("never exposes privileged browser credentials or raw output from %s", (workflow) => {
    const source = readFileSync(join(root, workflow), "utf8");
    expect(source).not.toContain("E2E_ADMIN_USER");
    expect(source).not.toContain("E2E_ADMIN_PASSWORD");
    const artifactUploads = source.match(/actions\/upload-artifact@/gu) ?? [];
    if (workflow.endsWith("preproduction-rehearsal.yml")) {
      expect(artifactUploads).toHaveLength(1);
      expect(source).toContain("name: preproduction-proof-${{ github.run_id }}-${{ github.run_attempt }}");
      expect(source).toContain("path: ${{ runner.temp }}/preproduction-proof.json");
    } else if (workflow.endsWith("deploy-prod.yml")) {
      expect(artifactUploads).toHaveLength(1);
      expect(source).toContain("name: production-proof-${{ github.run_id }}-${{ github.run_attempt }}");
      expect(source).toContain("path: ${{ runner.temp }}/production-proof.json");
    } else {
      expect(artifactUploads).toHaveLength(0);
    }
    expect(source).not.toMatch(/playwright-report-(?:test|preproduction|production)/u);
    expect(source).not.toMatch(/path:\s*[|>-]?\s*\n\s*(?:playwright-report|test-results)/u);
  });
});
