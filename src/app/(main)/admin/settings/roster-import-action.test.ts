import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), transaction: vi.fn(), findMany: vi.fn(), userFindMany: vi.fn(), deleteMany: vi.fn(),
  updateMany: vi.fn(), update: vi.fn(), createMany: vi.fn(), auditCreate: vi.fn(), tokenDeleteMany: vi.fn(), distributionUpdateMany: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));

describe("authoritative roster replacement action", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "admin", role: "ADMIN" });
    mocks.findMany.mockResolvedValue([]);
    mocks.userFindMany.mockResolvedValue([]);
    mocks.deleteMany.mockResolvedValue({ count: 1 });
    mocks.updateMany.mockResolvedValue({ count: 0 });
    mocks.createMany.mockResolvedValue({ count: 2 });
    mocks.tokenDeleteMany.mockResolvedValue({ count: 0 });
    mocks.auditCreate.mockResolvedValue({ id: "audit" });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      studentRosterEntry: {
        findMany: mocks.findMany,
        deleteMany: mocks.deleteMany,
        updateMany: mocks.updateMany,
        update: mocks.update,
        createMany: mocks.createMany,
      },
      user: { findMany: mocks.userFindMany, updateMany: mocks.updateMany },
      inviteToken: { deleteMany: mocks.tokenDeleteMany },
      tokenDistributionLog: { updateMany: mocks.distributionUpdateMany },
      systemSetting: { updateMany: mocks.updateMany },
      auditLog: { create: mocks.auditCreate },
    }));
  });

  it("replaces all unclaimed entries and writes a summary-only audit in one transaction", async () => {
    const { replaceStudentRoster } = await import("./actions");
    const form = new FormData();
    form.set("confirmText", "REPLACE ROSTER");
    form.set("file", new File([
      "academicYear,gisu,studentId,name,email\n2026,42,1304,Student One,one@example.com\n2026,41,2401,Student Two,two@example.com",
    ], "roster.csv", { type: "text/csv" }));
    await expect(replaceStudentRoster({}, form)).resolves.toMatchObject({ count: 2 });
    expect(mocks.transaction).toHaveBeenCalledOnce();
    expect(mocks.createMany).toHaveBeenCalledWith({ data: [
      { academicYear: 2026, gisu: 42, studentId: "1304", name: "Student One", email: "one@example.com", active: true },
      { academicYear: 2026, gisu: 41, studentId: "2401", name: "Student Two", email: "two@example.com", active: true },
    ] });
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({
      action: "STUDENT_ROSTER_REPLACED", targetId: "year:2026:rows:2",
    }) });
  });

  it("performs no database work for unauthorized or unconfirmed imports", async () => {
    const { replaceStudentRoster } = await import("./actions");
    const form = new FormData();
    form.set("file", new File(["academicYear,gisu,studentId,name,email\n2026,42,1304,A,a@example.com"], "roster.csv"));
    await expect(replaceStudentRoster({}, form)).resolves.toHaveProperty("error");
    expect(mocks.transaction).not.toHaveBeenCalled();
    mocks.getCurrentUser.mockResolvedValueOnce({ id: "student", role: "STUDENT" });
    await expect(replaceStudentRoster({}, form)).rejects.toThrow("Unauthorized");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
