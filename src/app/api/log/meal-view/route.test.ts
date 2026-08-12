import { beforeEach, describe, expect, it, vi } from "vitest";

const { appendBoundedSystemLog } = vi.hoisted(() => ({ appendBoundedSystemLog: vi.fn() }));
vi.mock("@/lib/system-log-store", () => ({ appendBoundedSystemLog }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));

describe("meal-view telemetry route", () => {
  beforeEach(() => {
    vi.resetModules();
    appendBoundedSystemLog.mockReset().mockResolvedValue("DROPPED");
    process.env.NEXT_PUBLIC_APP_URL = "https://gshs.app";
    delete process.env.TRUSTED_PROXY_HOPS;
  });

  it("accepts an exact empty payload even when bounded storage drops the event", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://gshs.app/api/log/meal-view", {
      method: "POST",
      headers: {
        Origin: "https://gshs.app", "Content-Type": "application/json",
        "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "no-cors", "Sec-Fetch-Dest": "empty",
      },
      body: "{}",
    }));
    expect(response.status).toBe(202);
    expect(appendBoundedSystemLog).toHaveBeenCalledWith(expect.objectContaining({ action: "MEAL_VIEW", path: "/meals" }));
  });

  it("rejects extra payload fields without writing", async () => {
    const { POST } = await import("./route");
    const response = await POST(new Request("https://gshs.app/api/log/meal-view", {
      method: "POST",
      headers: {
        Origin: "https://gshs.app", "Content-Type": "application/json",
        "Sec-Fetch-Site": "same-origin", "Sec-Fetch-Mode": "cors", "Sec-Fetch-Dest": "empty",
      },
      body: '{"extra":true}',
    }));
    expect(response.status).toBe(400);
    expect(appendBoundedSystemLog).not.toHaveBeenCalled();
  });
});
