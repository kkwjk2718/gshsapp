import { describe, expect, it } from "vitest";

import { SHARED_UNKNOWN_CLIENT_IP, resolveTrustedClientIp } from "./trusted-client-ip";

describe("resolveTrustedClientIp", () => {
  it("ignores spoofable forwarding headers when no trusted header is configured", () => {
    const requestHeaders = new Headers({
      "x-forwarded-for": "198.51.100.10",
      "x-real-ip": "203.0.113.10",
    });

    expect(resolveTrustedClientIp(requestHeaders, undefined)).toBe(SHARED_UNKNOWN_CLIENT_IP);
  });

  it.each([
    ["203.0.113.25", "203.0.113.25"],
    ["2001:db8::25", "2001:db8::25"],
  ])("accepts a single valid IP from the explicitly trusted header", (rawIp, expected) => {
    const requestHeaders = new Headers({ "x-gshs-client-ip": rawIp });

    expect(resolveTrustedClientIp(requestHeaders, "x-gshs-client-ip")).toBe(expected);
  });

  it.each([
    "student.example.com",
    "203.0.113.25, 198.51.100.10",
    "203.0.113.25:443",
    "",
  ])("maps an invalid configured header value to the shared unknown bucket", (rawIp) => {
    const requestHeaders = new Headers({ "x-gshs-client-ip": rawIp });

    expect(resolveTrustedClientIp(requestHeaders, "x-gshs-client-ip")).toBe(
      SHARED_UNKNOWN_CLIENT_IP,
    );
  });

  it("maps an invalid configured header name to the shared unknown bucket", () => {
    const requestHeaders = new Headers({ "x-gshs-client-ip": "203.0.113.25" });

    expect(resolveTrustedClientIp(requestHeaders, "x gshs client ip")).toBe(
      SHARED_UNKNOWN_CLIENT_IP,
    );
  });
});
