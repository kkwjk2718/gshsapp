import { describe, expect, it } from "vitest";

import {
  overflowCount,
  parseSystemLogRetentionDays,
  retentionCutoff,
  serializeSystemLogDetails,
} from "./system-log-store";

describe("bounded system log storage", () => {
  it.each([1, 30, 90, "1", "90"])("accepts retention value %j", (value) => {
    expect(parseSystemLogRetentionDays(value)).toBe(Number(value));
  });

  it.each([0, 91, -1, 1.5, NaN, Infinity, "1day", "", " 1"])("rejects retention value %j", (value) => {
    expect(parseSystemLogRetentionDays(value)).toBeNull();
  });

  it("uses exact elapsed days and safe overflow arithmetic", () => {
    expect(retentionCutoff(new Date("2026-03-09T01:02:03.000Z"), 1).toISOString())
      .toBe("2026-03-08T01:02:03.000Z");
    expect(overflowCount(101, 100)).toBe(1);
    expect(overflowCount(99, 100)).toBe(0);
  });

  it("redacts nested secrets, handles cycles, and returns bounded valid JSON", () => {
    const value: Record<string, unknown> = {
      ok: "visible",
      nested: { password: "no", Authorization: "Bearer no", token: "no" },
      long: "한".repeat(2_000),
    };
    value.self = value;
    const result = serializeSystemLogDetails(value);
    expect(result).not.toContain("Bearer no");
    expect(result).not.toContain('"no"');
    expect(new TextEncoder().encode(result ?? "").byteLength).toBeLessThanOrEqual(2_048);
    expect(() => JSON.parse(result ?? "")).not.toThrow();
  });
});
