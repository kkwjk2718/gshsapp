import { describe, expect, it, vi } from "vitest";

import {
  MAX_ERROR_REPORT_ROWS,
  MAX_SONG_REQUEST_ROWS,
  enforceErrorReportLifecycle,
  enforceSongRequestLifecycle,
} from "@/lib/submission-lifecycle";

describe("submission lifecycle", () => {
  it("prunes only old resolved reports before enforcing the hard cap", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 4 });
    const count = vi.fn().mockResolvedValue(MAX_ERROR_REPORT_ROWS - 1);
    await expect(enforceErrorReportLifecycle({ errorReport: { deleteMany, count } } as never, new Date("2026-08-13T00:00:00Z")))
      .resolves.toBeUndefined();
    expect(deleteMany).toHaveBeenCalledWith({ where: {
      status: "RESOLVED",
      resolvedAt: { lt: new Date("2025-08-13T00:00:00.000Z") },
    } });
  });

  it("rejects reports at the hard cap", async () => {
    const db = {
      errorReport: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(MAX_ERROR_REPORT_ROWS),
      },
    };
    await expect(enforceErrorReportLifecycle(db as never)).rejects.toThrow("Report storage limit reached");
  });

  it("prunes only old terminal songs before enforcing the hard cap", async () => {
    const deleteMany = vi.fn().mockResolvedValue({ count: 4 });
    const count = vi.fn().mockResolvedValue(MAX_SONG_REQUEST_ROWS - 1);
    await expect(enforceSongRequestLifecycle({ songRequest: { deleteMany, count } } as never, new Date("2026-08-13T00:00:00Z")))
      .resolves.toBeUndefined();
    expect(deleteMany).toHaveBeenCalledWith({ where: {
      status: { in: ["REJECTED", "PLAYED"] },
      createdAt: { lt: new Date("2025-08-13T00:00:00.000Z") },
    } });
  });

  it("rejects songs at the hard cap", async () => {
    const db = {
      songRequest: {
        deleteMany: vi.fn().mockResolvedValue({ count: 0 }),
        count: vi.fn().mockResolvedValue(MAX_SONG_REQUEST_ROWS),
      },
    };
    await expect(enforceSongRequestLifecycle(db as never)).rejects.toThrow("Song storage limit reached");
  });
});
