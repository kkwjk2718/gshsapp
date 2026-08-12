import { describe, expect, it } from "vitest";
import { isValidGoogleAnalyticsId, normalizeGoogleAnalyticsId } from "./system-settings";

describe("isValidGoogleAnalyticsId", () => {
  it("accepts valid GA4 measurement ids", () => {
    expect(isValidGoogleAnalyticsId("G-ABC123XYZ")).toBe(true);
  });

  it("accepts lowercase input", () => {
    expect(isValidGoogleAnalyticsId("g-test123")).toBe(true);
  });

  it("rejects missing prefixes", () => {
    expect(isValidGoogleAnalyticsId("ABC123XYZ")).toBe(false);
  });

  it("rejects blank input", () => {
    expect(isValidGoogleAnalyticsId("")).toBe(false);
  });

  it("rejects unsupported characters", () => {
    expect(isValidGoogleAnalyticsId("G-ABC_123")).toBe(false);
  });

  it("rejects unbounded or script-shaped persisted values before client serialization", () => {
    expect(normalizeGoogleAnalyticsId("G-ABC123")).toBe("G-ABC123");
    expect(normalizeGoogleAnalyticsId(" g-abc123 ")).toBe("G-ABC123");
    expect(normalizeGoogleAnalyticsId("G-ABC123';alert(1)//")).toBeNull();
    expect(normalizeGoogleAnalyticsId(`G-${"A".repeat(65)}`)).toBeNull();
  });
});
