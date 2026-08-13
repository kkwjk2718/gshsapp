import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(), findUnique: vi.fn(), update: vi.fn(), updateMany: vi.fn(), transaction: vi.fn(), auditCreate: vi.fn(),
  compare: vi.fn(), hash: vi.fn(), signOut: vi.fn(), limiterCheck: vi.fn(), limiterFailure: vi.fn(), limiterClear: vi.fn(),
  clientAddress: vi.fn(), rosterFindFirst: vi.fn(),
}));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("@/lib/db", () => ({ prisma: {
  user: { findUnique: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany }, auditLog: { create: mocks.auditCreate },
  studentRosterEntry: { findFirst: mocks.rosterFindFirst },
  personalEvent: { count: vi.fn() }, $transaction: mocks.transaction,
} }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare, hash: mocks.hash } }));
vi.mock("@/auth", () => ({ signOut: mocks.signOut }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "192.0.2.10" }) }));
vi.mock("@/lib/security/password-change-limit", () => ({
  passwordChangeLimiter: { check: mocks.limiterCheck, recordFailure: mocks.limiterFailure, clearUser: mocks.limiterClear },
}));
vi.mock("@/lib/security/principal-key", () => ({
  getApplicationSecuritySecret: () => "strong-test-secret-material-over-32-bytes",
  hashSecurityPrincipal: (namespace: string, value: string) => `${namespace}:${value}`,
}));
vi.mock("@/lib/security/client-address", () => ({
  parseTrustedProxyHops: () => 1,
  resolveTrustedClientAddress: mocks.clientAddress,
  isSensitiveClientAddressTrusted: (address: string | null, hops: number) => hops === 0 || address !== null,
}));

describe("self profile and credential actions", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "user", role: "STUDENT", mustChangePassword: false });
    mocks.update.mockResolvedValue({ id: "user" });
    mocks.updateMany.mockResolvedValue({ count: 1 });
    mocks.auditCreate.mockResolvedValue({ id: "audit" });
    mocks.limiterCheck.mockReturnValue({ locked: false });
    mocks.clientAddress.mockReturnValue("192.0.2.10");
    mocks.rosterFindFirst.mockResolvedValue({ name: "Hong Gildong", email: "student@example.com" });
    mocks.findUnique.mockResolvedValue({ id: "user", email: "student@example.com", passwordHash: "old", sessionVersion: 3 });
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({ user: { findUnique: mocks.findUnique, update: mocks.update, updateMany: mocks.updateMany }, studentRosterEntry: { findFirst: mocks.rosterFindFirst }, auditLog: { create: mocks.auditCreate } }));
  });

  it("normalizes self-service fields and never accepts a studentId change", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user", role: "ADMIN", mustChangePassword: false });
    const { updateProfile } = await import("./actions");
    const form = new FormData();
    form.set("name", "  Hong Gildong  ");
    form.set("email", " Student@Example.COM ");
    form.set("studentId", "9999");

    await expect(updateProfile(form)).resolves.toHaveProperty("success");
    expect(mocks.update).toHaveBeenCalledWith({
      where: { id: "user" },
      data: { name: "Hong Gildong", email: "student@example.com" },
    });
  });

  it("applies the central password policy before hashing or writing", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user", mustChangePassword: true });
    mocks.findUnique.mockResolvedValue({ id: "user", passwordHash: "old", sessionVersion: 3 });
    mocks.compare.mockResolvedValue(true);
    const { changePassword } = await import("./actions");
    const form = new FormData();
    form.set("currentPassword", "current"); form.set("newPassword", "short"); form.set("confirmPassword", "short");

    await expect(changePassword(form)).resolves.toHaveProperty("error");
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects an oversized current password before bcrypt comparison or any write", async () => {
    mocks.findUnique.mockResolvedValue({ id: "user", passwordHash: "old", sessionVersion: 3 });
    const { changePassword } = await import("./actions");
    const form = new FormData();
    form.set("currentPassword", "가".repeat(25));
    form.set("newPassword", "safe-new-password-2026");
    form.set("confirmPassword", "safe-new-password-2026");

    await expect(changePassword(form)).resolves.toHaveProperty("error");
    expect(mocks.compare).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.updateMany).not.toHaveBeenCalled();
  });

  it("does not let a roster-governed user replace an authoritative name or email", async () => {
    const { updateProfile } = await import("./actions");
    const form = new FormData();
    form.set("name", "Other Student");
    form.set("email", "student@example.com");

    await expect(updateProfile(form)).resolves.toEqual({
      error: "Student name and email are managed by the authoritative roster.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("does not let any role self-assert a new unverified mailbox", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user", role: "GRADUATE", mustChangePassword: false });
    const { updateProfile } = await import("./actions");
    const form = new FormData();
    form.set("name", "Graduate");
    form.set("email", "unclaimed-student@example.com");

    await expect(updateProfile(form)).resolves.toEqual({
      error: "Email changes require an administrator-verified identity update.",
    });
    expect(mocks.update).not.toHaveBeenCalled();
  });

  it("rejects a missing trusted proxy address before bcrypt", async () => {
    mocks.findUnique.mockResolvedValue({ id: "user", passwordHash: "old", sessionVersion: 3 });
    mocks.clientAddress.mockReturnValueOnce(null);
    const { changePassword } = await import("./actions");
    const form = new FormData();
    form.set("currentPassword", "current"); form.set("newPassword", "safe-new-password-2026"); form.set("confirmPassword", "safe-new-password-2026");
    await expect(changePassword(form)).resolves.toHaveProperty("error");
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it("rejects an exhausted account before bcrypt and records every bounded comparison", async () => {
    mocks.findUnique.mockResolvedValue({ id: "user", passwordHash: "old", sessionVersion: 3 });
    mocks.limiterCheck.mockReturnValueOnce({ locked: true });
    const { changePassword } = await import("./actions");
    const form = new FormData();
    form.set("currentPassword", "current"); form.set("newPassword", "safe-new-password-2026"); form.set("confirmPassword", "safe-new-password-2026");

    await expect(changePassword(form)).resolves.toHaveProperty("error");
    expect(mocks.compare).not.toHaveBeenCalled();

    mocks.limiterCheck.mockReturnValue({ locked: false });
    mocks.compare.mockResolvedValue(false);
    await changePassword(form);
    expect(mocks.limiterFailure).toHaveBeenCalledTimes(1);

    mocks.compare.mockResolvedValue(true);
    await changePassword(form);
    expect(mocks.limiterFailure).toHaveBeenCalledTimes(2);
  });

  it("clears forced rotation, revokes sessions, and audits in the same transaction", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user", mustChangePassword: true });
    mocks.findUnique.mockResolvedValue({ id: "user", passwordHash: "old", sessionVersion: 3 });
    mocks.compare.mockResolvedValue(true);
    mocks.hash.mockResolvedValue("new-hash");
    const { changePassword } = await import("./actions");
    const form = new FormData();
    form.set("currentPassword", "current"); form.set("newPassword", "safe-new-password-2026"); form.set("confirmPassword", "safe-new-password-2026");

    await expect(changePassword(form)).resolves.toHaveProperty("success");
    expect(mocks.updateMany).toHaveBeenCalledWith({ where: { id: "user", passwordHash: "old", sessionVersion: 3 }, data: {
      passwordHash: "new-hash", mustChangePassword: false, sessionVersion: { increment: 1 },
    } });
    expect(mocks.auditCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ action: "USER_PASSWORD_CHANGED", targetId: "user" }) });
    expect(mocks.signOut).toHaveBeenCalled();
  });

  it("does not overwrite a concurrent admin reset and emits no misleading audit", async () => {
    mocks.getCurrentUser.mockResolvedValue({ id: "user", mustChangePassword: false });
    mocks.findUnique.mockResolvedValue({ id: "user", passwordHash: "old", sessionVersion: 3 });
    mocks.compare.mockResolvedValue(true);
    mocks.hash.mockResolvedValue("new-hash");
    mocks.updateMany.mockResolvedValue({ count: 0 });
    const { changePassword } = await import("./actions");
    const form = new FormData();
    form.set("currentPassword", "current"); form.set("newPassword", "safe-new-password-2026"); form.set("confirmPassword", "safe-new-password-2026");

    await expect(changePassword(form)).resolves.toHaveProperty("error");
    expect(mocks.auditCreate).not.toHaveBeenCalled();
    expect(mocks.signOut).not.toHaveBeenCalled();
  });
});
