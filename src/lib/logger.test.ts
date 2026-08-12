import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ append: vi.fn(), headers: vi.fn(), auth: vi.fn(), create: vi.fn() }));
vi.mock("@/lib/system-log-store", () => ({
  appendBoundedSystemLog: mocks.append,
  serializeSystemLogDetails: (value: unknown) => value == null ? null : JSON.stringify(value),
}));
vi.mock("next/headers", () => ({ headers: mocks.headers }));
vi.mock("@/auth", () => ({ auth: mocks.auth }));
vi.mock("@/lib/db", () => ({ prisma: { systemLog: { create: mocks.create } } }));

describe("bounded operational logger", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    delete process.env.TRUSTED_PROXY_HOPS;
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
    process.env.NEXT_PUBLIC_APP_URL = "https://gshs.app";
    mocks.auth.mockResolvedValue({ user: { id: "member" } });
    mocks.headers.mockResolvedValue(new Headers({
      referer: "https://gshs.app/signup?token=secret#x",
      "user-agent": "agent",
      "x-forwarded-for": "198.51.100.1",
    }));
    mocks.append.mockResolvedValue("STORED");
  });

  it("strips referer secrets and ignores forwarded IP by default", async () => {
    process.env.TRUSTED_CLIENT_IP_HEADER = "x-gshs-client-ip";
    mocks.headers.mockResolvedValue(new Headers({
      referer: "https://gshs.app/signup?token=secret#x",
      "user-agent": "agent",
      "x-forwarded-for": "198.51.100.1",
      "x-gshs-client-ip": "203.0.113.9",
    }));
    const { logAction } = await import("./logger");
    await logAction("LOGIN", { safe: true });
    expect(mocks.append).toHaveBeenCalledWith({
      action: "LOGIN", userId: "member", ip: null, userAgent: "agent",
      path: "/signup", details: expect.any(String),
    });
    expect(JSON.stringify(mocks.append.mock.calls)).not.toContain("token=secret");
  });

  it("uses explicit context without recursively resolving a session", async () => {
    const { logAction } = await import("./logger");
    await logAction("LOGIN", undefined, "/login", { userId: "member", requestHeaders: new Headers() });
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.append).toHaveBeenCalledWith(expect.objectContaining({ userId: "member", path: "/login" }));
  });
});
