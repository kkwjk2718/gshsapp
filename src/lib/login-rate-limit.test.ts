import { beforeEach, describe, expect, it, vi } from "vitest";

const count = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { systemLog: { count } } }));

describe("login failure persistence boundary", () => {
  beforeEach(() => count.mockReset().mockResolvedValue(0));

  it("counts only genuine verification failures, never blocked probes", async () => {
    const { countRecentFailedLogins } = await import("./login-rate-limit");
    await countRecentFailedLogins("student01");

    expect(count).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ action: "LOGIN_FAILED" }),
    }));
  });

  it("rejects empty or oversized identifiers before querying logs", async () => {
    const { countRecentFailedLogins } = await import("./login-rate-limit");
    await expect(countRecentFailedLogins(" ")).resolves.toBe(0);
    await expect(countRecentFailedLogins("x".repeat(129))).resolves.toBe(0);
    expect(count).not.toHaveBeenCalled();
  });

  it("uses bounded identifier and network dimensions without extending blocked checks", async () => {
    const { createLoginAttemptLimiter } = await import("./login-rate-limit");
    let now = 0;
    const limiter = createLoginAttemptLimiter({ now: () => now, maxFailures: 2, windowMs: 10_000, maxKeys: 2 });

    expect(limiter.recordFailure("id-a", "net-a")).toMatchObject({ locked: false });
    expect(limiter.recordFailure("id-a", "net-a")).toMatchObject({ locked: true });
    now = 5_000;
    expect(limiter.check("id-a", "net-a")).toMatchObject({ locked: true, retryAfterMs: 5_000 });
    expect(limiter.check("id-a", "net-a")).toMatchObject({ locked: true, retryAfterMs: 5_000 });
    now = 10_000;
    expect(limiter.check("id-a", "net-a")).toMatchObject({ locked: false });
  });

  it("keeps the identifier threshold strict while allowing a school NAT a higher network threshold", async () => {
    const { createLoginAttemptLimiter } = await import("./login-rate-limit");
    const limiter = createLoginAttemptLimiter({
      identifierMaxFailures: 2,
      networkMaxFailures: 4,
      windowMs: 10_000,
    });

    expect(limiter.recordFailure("id-a", "school-nat")).toMatchObject({ locked: false });
    expect(limiter.recordFailure("id-b", "school-nat")).toMatchObject({ locked: false });
    expect(limiter.check("id-c", "school-nat")).toMatchObject({ locked: false });
    expect(limiter.recordFailure("id-a", "school-nat")).toMatchObject({ locked: true });
    expect(limiter.check("id-c", "school-nat")).toMatchObject({ locked: false });
    expect(limiter.recordFailure("id-c", "school-nat")).toMatchObject({ locked: true });
  });

  it("never creates a shared global bucket when the client address is unavailable", async () => {
    const { createLoginAttemptLimiter } = await import("./login-rate-limit");
    const limiter = createLoginAttemptLimiter({ identifierMaxFailures: 2, networkMaxFailures: 2 });

    expect(limiter.recordFailure("id-a", null)).toMatchObject({ locked: false });
    expect(limiter.recordFailure("id-b", null)).toMatchObject({ locked: false });
    expect(limiter.check("id-c", null)).toMatchObject({ locked: false });
  });

  it("samples blocked-request logging once per principal and window", async () => {
    const { createBlockedLoginLogSampler } = await import("./login-rate-limit");
    let now = 0;
    const sampler = createBlockedLoginLogSampler({ now: () => now, windowMs: 60_000, maxKeys: 2 });

    expect(sampler.shouldLog("id-a", "network-a")).toBe(true);
    expect(sampler.shouldLog("id-b", "network-a")).toBe(false);
    expect(sampler.shouldLog("id-a", null)).toBe(true);
    expect(sampler.shouldLog("id-a", null)).toBe(false);
    now = 60_000;
    expect(sampler.shouldLog("id-b", "network-a")).toBe(true);
  });
});
