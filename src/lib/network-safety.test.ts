import { describe, expect, it, vi } from "vitest";
import {
  hasBlockedHostname,
  createPinnedLookup,
  isPrivateOrReservedIpAddress,
  parseAllowedICalHttpsUrl,
  parseExternalHttpsUrl,
  resolvePinnedPublicAddress,
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
    expect(isPrivateOrReservedIpAddress("0:0:0:0:0:0:0:1")).toBe(true);
    expect(isPrivateOrReservedIpAddress("fc00::1")).toBe(true);
    expect(isPrivateOrReservedIpAddress("fd12::1234")).toBe(true);
    expect(isPrivateOrReservedIpAddress("fe80::1")).toBe(true);
    expect(isPrivateOrReservedIpAddress("::ffff:7f00:1")).toBe(true);
    expect(isPrivateOrReservedIpAddress("::ffff:c0a8:101")).toBe(true);
    expect(isPrivateOrReservedIpAddress("64:ff9b::c0a8:101")).toBe(true);
    expect(isPrivateOrReservedIpAddress("2001:4860:4860::8888")).toBe(false);
    expect(isPrivateOrReservedIpAddress("2001:0db8::1")).toBe(true);
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
    expect(() => parseExternalHttpsUrl("https://[::1]/test.ics")).toThrow();
  });

  it("accepts only exact configured iCal provider hosts without credentials or ports", () => {
    expect(parseAllowedICalHttpsUrl("https://calendar.google.com/calendar/ical/example/basic.ics").hostname).toBe(
      "calendar.google.com",
    );
    expect(() => parseAllowedICalHttpsUrl("https://calendar.google.com.evil.test/feed.ics")).toThrow();
    expect(() => parseAllowedICalHttpsUrl("https://user:pass@calendar.google.com/feed.ics")).toThrow();
    expect(() => parseAllowedICalHttpsUrl("https://calendar.google.com:444/feed.ics")).toThrow();
    expect(() => parseAllowedICalHttpsUrl("https://calendar.example.com/feed.ics")).toThrow();
    expect(() => parseAllowedICalHttpsUrl("https://8.8.8.8/feed.ics", new Set(["8.8.8.8"]))).toThrow();
    expect(
      parseAllowedICalHttpsUrl("https://calendar.example.com/feed.ics", new Set(["calendar.example.com"])).hostname,
    ).toBe("calendar.example.com");
  });

  it("pins only a public DNS result and rejects mixed private answers", async () => {
    await expect(
      resolvePinnedPublicAddress("calendar.google.com", async () => [
        { address: "142.250.66.78", family: 4 },
        { address: "192.168.0.1", family: 4 },
      ]),
    ).rejects.toThrow("private or reserved");

    await expect(
      resolvePinnedPublicAddress("calendar.google.com", async () => [{ address: "142.250.66.78", family: 4 }]),
    ).resolves.toEqual({ address: "142.250.66.78", family: 4 });
  });

  it("bounds DNS resolution time before an iCal connection is attempted", async () => {
    vi.useFakeTimers();
    try {
      const resolution = resolvePinnedPublicAddress(
        "calendar.google.com",
        async () => await new Promise<never>(() => {}),
      );
      const rejection = expect(resolution).rejects.toThrow("timed out");

      await vi.advanceTimersByTimeAsync(5_000);
      await rejection;
    } finally {
      vi.useRealTimers();
    }
  });

  it("returns only the prevalidated address for both Node lookup callback modes", async () => {
    const lookup = createPinnedLookup({ address: "142.250.66.78", family: 4 });

    await expect(
      new Promise((resolve, reject) => {
        lookup("calendar.google.com", { all: false }, (error, address, family) => {
          if (error) reject(error);
          else resolve({ address, family });
        });
      }),
    ).resolves.toEqual({ address: "142.250.66.78", family: 4 });

    await expect(
      new Promise((resolve, reject) => {
        lookup("calendar.google.com", { all: true }, (error, addresses) => {
          if (error) reject(error);
          else resolve(addresses);
        });
      }),
    ).resolves.toEqual([{ address: "142.250.66.78", family: 4 }]);
  });
});
