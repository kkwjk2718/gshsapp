import { describe, expect, it } from "vitest";
import { normalizeLocalRedirect } from "./local-redirect";

describe("normalizeLocalRedirect", () => {
  it.each([
    ["/", "/"],
    ["/me?tab=security#password", "/me?tab=security#password"],
    [null, "/login"],
    ["", "/login"],
    ["https://evil.example/phish", "/login"],
    ["//evil.example/phish", "/login"],
    ["/\\evil.example/phish", "/login"],
    ["\\evil.example\\phish", "/login"],
    ["/\t/evil.example/phish", "/login"],
    ["/safe\r\nLocation: https://evil.example", "/login"],
    ["/safe\u007fpath", "/login"],
  ])("normalizes %j to %j", (value, expected) => {
    expect(normalizeLocalRedirect(value, "/login")).toBe(expected);
  });
});
