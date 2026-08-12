import { beforeEach, describe, expect, it, vi } from "vitest";

const { appendBoundedSystemLog } = vi.hoisted(() => ({ appendBoundedSystemLog: vi.fn() }));
vi.mock("@/lib/system-log-store", () => ({ appendBoundedSystemLog }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));

function request(body: string, overrides: Record<string, string> = {}) {
  return new Request("https://gshs.app/api/log/page-view", {
    method: "POST",
    headers: {
      Origin: "https://gshs.app",
      "Content-Type": "application/json",
      "Sec-Fetch-Site": "same-origin",
      "Sec-Fetch-Mode": "cors",
      "Sec-Fetch-Dest": "empty",
      ...overrides,
    },
    body,
  });
}

describe("page-view telemetry route", () => {
  beforeEach(() => {
    vi.resetModules();
    appendBoundedSystemLog.mockReset().mockResolvedValue("STORED");
    process.env.NEXT_PUBLIC_APP_URL = "https://gshs.app";
    delete process.env.TRUSTED_PROXY_HOPS;
    delete process.env.TRUSTED_CLIENT_IP_HEADER;
  });

  it("rejects a wrong origin before writing despite a matching request URL", async () => {
    const { POST } = await import("./route");
    const response = await POST(request('{"pathname":"/"}', { Origin: "https://evil.example" }));
    expect(response.status).toBe(403);
    expect(appendBoundedSystemLog).not.toHaveBeenCalled();
  });

  it("rejects unsupported content types and oversized bodies before writing", async () => {
    const { POST } = await import("./route");
    expect((await POST(request("{}", { "Content-Type": "text/plain" }))).status).toBe(415);
    expect((await POST(request("{}", { "Content-Length": "1025" }))).status).toBe(413);
    expect(appendBoundedSystemLog).not.toHaveBeenCalled();
  });

  it("stores a validated pathname and returns generic no-store 202", async () => {
    const { POST } = await import("./route");
    const response = await POST(request('{"pathname":"/meals"}'));
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true });
    expect(appendBoundedSystemLog).toHaveBeenCalledWith(expect.objectContaining({ action: "PAGE_VIEW", path: "/meals" }));
  });

  it("does not let one client drain global quota after its client quota is exhausted", async () => {
    process.env.TRUSTED_PROXY_HOPS = "1";
    const { POST } = await import("./route");
    for (let index = 0; index < 30; index += 1) {
      expect((await POST(request('{"pathname":"/"}', { "x-forwarded-for": "203.0.113.1" }))).status).toBe(202);
    }
    for (let index = 0; index < 600; index += 1) {
      expect((await POST(request('{"pathname":"/"}', { "x-forwarded-for": "203.0.113.1" }))).status).toBe(429);
    }
    expect((await POST(request('{"pathname":"/"}', { "x-forwarded-for": "203.0.113.2" }))).status).toBe(202);
  });

  it("ignores the legacy arbitrary trusted header without a trusted proxy hop", async () => {
    process.env.TRUSTED_CLIENT_IP_HEADER = "x-gshs-client-ip";
    const { POST } = await import("./route");
    expect((await POST(request('{"pathname":"/"}', { "x-gshs-client-ip": "203.0.113.55" }))).status).toBe(202);
    expect(appendBoundedSystemLog).toHaveBeenLastCalledWith(expect.objectContaining({ ip: null }));
  });
});
