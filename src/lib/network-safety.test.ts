import { describe, expect, it } from "vitest";
import {
  hasBlockedHostname,
  isPrivateOrReservedIpAddress,
  parseExternalHttpsUrl,
} from "@/lib/network-safety";

describe("network safety helpers", () => {
  it("blocks private and reserved IPv4 ranges", () => {
    expect(isPrivateOrReservedIpAddress("127.0.0.1")).toBe(true);
    expect(isPrivateOrReservedIpAddress("10.0.0.8")).toBe(true);
    expect(isPrivateOrReservedIpAddress("172.16.5.4")).toBe(true);
    expect(isPrivateOrReservedIpAddress("192.168.1.12")).toBe(true);
    expect(isPrivateOrReservedIpAddress("169.254.10.20")).toBe(true);
    expect(isPrivateOrReservedIpAddress("8.8.8.8")).toBe(false);
  });

  it("blocks private and reserved IPv6 ranges", () => {
    expect(isPrivateOrReservedIpAddress("::1")).toBe(true);
    expect(isPrivateOrReservedIpAddress("fc00::1")).toBe(true);
    expect(isPrivateOrReservedIpAddress("fd12::1234")).toBe(true);
    expect(isPrivateOrReservedIpAddress("fe80::1")).toBe(true);
    expect(isPrivateOrReservedIpAddress("2001:4860:4860::8888")).toBe(false);
  });

  it("blocks local hostnames and local suffixes", () => {
    expect(hasBlockedHostname("localhost")).toBe(true);
    expect(hasBlockedHostname("school-server.local")).toBe(true);
    expect(hasBlockedHostname("calendar.internal")).toBe(true);
    expect(hasBlockedHostname("calendar.home.arpa")).toBe(true);
    expect(hasBlockedHostname("calendar.google.com")).toBe(false);
  });

  it("accepts only safe external https URLs", () => {
    expect(() => parseExternalHttpsUrl("https://calendar.google.com/test.ics")).not.toThrow();
    expect(() => parseExternalHttpsUrl("http://calendar.google.com/test.ics")).toThrow();
    expect(() => parseExternalHttpsUrl("https://localhost/test.ics")).toThrow();
    expect(() => parseExternalHttpsUrl("https://192.168.0.10/test.ics")).toThrow();
  });
});
