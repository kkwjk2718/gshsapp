import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  findUser: vi.fn(),
  createNotification: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/lib/notifications", () => ({ createNotification: vi.fn() }));
vi.mock("@/lib/db", () => ({
  prisma: {
    user: { findMany: vi.fn(), findUnique: mocks.findUser },
    notification: { createMany: vi.fn() },
    $transaction: mocks.transaction,
  },
}));

import { sendAdminNotification } from "./actions";

function notificationForm(link: string) {
  const form = new FormData();
  form.set("targetType", "USER");
  form.set("targetUserId", "student");
  form.set("title", "Security notice");
  form.set("content", "Please review your settings.");
  form.set("link", link);
  return form;
}

describe("admin notification security", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "admin-1", role: "ADMIN" });
    mocks.findUser.mockResolvedValue({ id: "user-1" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      notification: { create: mocks.createNotification, createMany: vi.fn() },
      auditLog: { create: vi.fn() },
    }));
  });

  it.each(["javascript:alert(1)", "data:text/html,attack", "https://evil.example/phish", "//evil.example"])(
    "rejects unsafe navigation link %s before database work",
    async (link) => {
      const result = await sendAdminNotification(notificationForm(link));
      expect(result).toHaveProperty("error");
      expect(mocks.findUser).not.toHaveBeenCalled();
      expect(mocks.transaction).not.toHaveBeenCalled();
    },
  );

  it("normalizes a local link and couples notification with an audit record", async () => {
    const result = await sendAdminNotification(notificationForm(" /me?tab=security "));

    expect(result).toHaveProperty("success");
    expect(mocks.createNotification).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-1", link: "/me?tab=security" }),
    });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actorId: "admin-1",
      action: "ADMIN_NOTIFICATION_SENT",
    }));
  });
});
