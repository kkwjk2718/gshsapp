import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  create: vi.fn(),
  transaction: vi.fn(),
  setting: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: {
    systemLog: { create: mocks.create },
    systemSetting: { findUnique: mocks.setting },
    $transaction: mocks.transaction,
  },
}));

describe("system log write amplification boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.create.mockResolvedValue({ id: "log" });
  });

  it("performs one insert without retention scans or a writer transaction", async () => {
    const { appendBoundedSystemLog } = await import("./system-log-store");

    await expect(appendBoundedSystemLog({ action: "LOGIN_BLOCKED" })).resolves.toBe("STORED");

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.setting).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
