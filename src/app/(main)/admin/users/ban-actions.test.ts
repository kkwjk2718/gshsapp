import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), findUnique: vi.fn(), update: vi.fn(), auditCreate: vi.fn(), transaction: vi.fn(), notify: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({ prisma: {
  user: { findUnique: mocks.findUnique, update: mocks.update }, auditLog: { create: mocks.auditCreate },
  $transaction: mocks.transaction,
} }));
vi.mock("@/lib/notifications", () => ({ createNotification: mocks.notify }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("@/lib/grade-utils", () => ({ getGradeMapping: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("bcryptjs", () => ({ default: { hash: vi.fn() } }));

function form(userId: string, reason = "Repeated abusive requests") {
  const data = new FormData();
  data.set("userId", userId);
  data.set("banUntil", "2026-08-20T00:00:00.000Z");
  data.set("reason", reason);
  return data;
}

describe("song-request ban policy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      user: { findUnique: mocks.findUnique, update: mocks.update }, auditLog: { create: mocks.auditCreate },
    }));
  });
  it.each(["ADMIN", "BROADCAST"])("prevents a broadcaster from targeting %s", async (role) => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-13T00:00:00Z"));
    mocks.getCurrentUser.mockResolvedValue({ id: "broadcast-1", role: "BROADCAST" });
    mocks.findUnique.mockResolvedValue({ id: "target", role });
    const { banUser } = await import("./actions");
    await expect(banUser(form("target"))).resolves.toEqual({ error: "Target is not eligible for a song-request ban." });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("writes actor and eligible target audit inside the mutation transaction", async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date("2026-08-13T00:00:00Z"));
    mocks.getCurrentUser.mockResolvedValue({ id: "broadcast-1", role: "BROADCAST" });
    mocks.findUnique.mockResolvedValue({ id: "student-1", role: "STUDENT" });
    mocks.update.mockResolvedValue({}); mocks.auditCreate.mockResolvedValue({}); mocks.notify.mockResolvedValue({});
    const { banUser } = await import("./actions");
    await expect(banUser(form("student-1"))).resolves.toHaveProperty("success");
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ actorId: "broadcast-1", action: "USER_BANNED", targetId: "student-1" }) });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    vi.useRealTimers();
  });
});
