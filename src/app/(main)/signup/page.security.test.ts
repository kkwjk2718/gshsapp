import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("signup page token transport", () => {
  it("does not read invite tokens from server-visible query parameters or submit them with GET", () => {
    const page = readFileSync(new URL("./page.tsx", import.meta.url), "utf8");
    const entry = readFileSync(new URL("./token-input.tsx", import.meta.url), "utf8");
    expect(page).not.toMatch(/searchParams|searchToken/);
    expect(entry).not.toMatch(/method=["']GET["']|action=["']\/signup["']/);
    expect(entry).toContain("window.location.hash");
    expect(entry).toContain("history.replaceState");
  });
});
