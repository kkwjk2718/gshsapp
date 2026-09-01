import { describe, expect, it, vi } from "vitest";

import { downloadTextFile, sanitizeDownloadFilename, type DownloadEnvironment } from "./client-download";

function fakeEnvironment(click: () => void = () => {}) {
  const remove = vi.fn();
  const anchor = { href: "", download: "", click, remove } as unknown as HTMLAnchorElement;
  const cleanup: Array<() => void> = [];
  const environment: DownloadEnvironment = {
    createObjectUrl: vi.fn(() => "blob:one"),
    revokeObjectUrl: vi.fn(),
    createAnchor: vi.fn(() => anchor),
    appendAnchor: vi.fn(),
    scheduleCleanup: vi.fn((callback) => cleanup.push(callback)),
  };
  return { environment, anchor, remove, cleanup };
}

describe("client downloads", () => {
  it("removes the anchor and revokes the exact URL after success", () => {
    const click = vi.fn();
    const { environment, anchor, remove, cleanup } = fakeEnvironment(click);
    downloadTextFile("\ufeffcsv", { filename: "logs.csv", mimeType: "text/csv" }, environment);
    expect(click).toHaveBeenCalledOnce();
    expect(anchor.download).toBe("logs.csv");
    expect(remove).toHaveBeenCalledOnce();
    expect(environment.revokeObjectUrl).not.toHaveBeenCalled();
    cleanup[0]();
    expect(environment.revokeObjectUrl).toHaveBeenCalledWith("blob:one");
  });

  it("still removes and schedules revocation when clicking throws", () => {
    const { environment, remove, cleanup } = fakeEnvironment(() => { throw new Error("click"); });
    expect(() => downloadTextFile("csv", { filename: "logs.csv", mimeType: "text/csv" }, environment)).toThrow("click");
    expect(remove).toHaveBeenCalledOnce();
    cleanup[0]();
    expect(environment.revokeObjectUrl).toHaveBeenCalledOnce();
  });

  it("sanitizes basename and preserves a CSV suffix within 120 code points", () => {
    expect(sanitizeDownloadFilename(" ../bad:<name>.csv ", "tokens.csv")).toBe(".._bad__name_.csv");
    expect(sanitizeDownloadFilename("..", "tokens.csv")).toBe("tokens.csv");
    const value = sanitizeDownloadFilename(`${"😀".repeat(130)}.csv`, "tokens.csv");
    expect([...value]).toHaveLength(120);
    expect(value.endsWith(".csv")).toBe(true);
  });
});
