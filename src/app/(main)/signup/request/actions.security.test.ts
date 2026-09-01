import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(), compare: vi.fn(), hasSession: vi.fn(), sendInvite: vi.fn(), roster: vi.fn(), clientAddress: vi.fn(),
}));
vi.mock("@/lib/member-service-suspension", () => ({ MEMBER_SERVICE_SUSPENDED: false }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/system-settings", () => ({ getTokenPortalSettings: mocks.settings }));
vi.mock("@/lib/token-portal-session", () => ({
  getPortalClientKey: vi.fn(), hasValidPortalSession: mocks.hasSession, setPortalSessionCookie: vi.fn(),
}));
vi.mock("@/lib/token-portal", () => ({ sendPortalStudentInvite: mocks.sendInvite }));
vi.mock("@/lib/student-roster", () => ({ validatePortalRosterIdentity: mocks.roster }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/security/principal-key", () => ({
  getApplicationSecuritySecret: () => "strong-test-secret-material-over-32-bytes",
  hashSecurityPrincipal: (namespace: string, value: string) => `${namespace}:${value}`,
}));
vi.mock("@/lib/security/client-address", () => ({
  parseTrustedProxyHops: () => 1,
  resolveTrustedClientAddress: mocks.clientAddress,
  isSensitiveClientAddressTrusted: (address: string | null, hops: number) => hops === 0 || address !== null,
}));

describe("portal action cheap rejection", () => {
  beforeEach(() => { vi.clearAllMocks(); mocks.clientAddress.mockReturnValue("192.0.2.10"); });

  it("rejects bcrypt-oversized portal passwords before settings lookup or compare", async () => {
    const { unlockTokenPortal } = await import("./actions");
    const form = new FormData(); form.set("password", "가".repeat(25));
    await expect(unlockTokenPortal({}, form)).resolves.toHaveProperty("error");
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it("rejects malformed invitation fields before session, settings, or provider work", async () => {
    const { requestSignupToken } = await import("./actions");
    const form = new FormData();
    form.set("name", "x".repeat(81)); form.set("studentId", "1304"); form.set("email", "student@example.com");
    await expect(requestSignupToken({}, form)).resolves.toHaveProperty("error");
    expect(mocks.settings).not.toHaveBeenCalled();
    expect(mocks.hasSession).not.toHaveBeenCalled();
    expect(mocks.sendInvite).not.toHaveBeenCalled();
  });

  it("rejects a missing trusted proxy address before portal bcrypt", async () => {
    mocks.settings.mockResolvedValue({ enabled: true, passwordHash: "hash", sessionVersion: 1 });
    mocks.clientAddress.mockReturnValueOnce(null);
    const { unlockTokenPortal } = await import("./actions");
    const form = new FormData(); form.set("password", "valid portal password");
    await expect(unlockTokenPortal({}, form)).resolves.toHaveProperty("error");
    expect(mocks.compare).not.toHaveBeenCalled();
  });

  it("requires an exact server-side roster match before sending an invitation", async () => {
    mocks.settings.mockResolvedValue({ enabled: true, sessionVersion: 1 });
    mocks.hasSession.mockResolvedValue(true);
    mocks.roster.mockResolvedValue(null);
    const { requestSignupToken } = await import("./actions");
    const form = new FormData();
    form.set("name", "Student"); form.set("studentId", "1304"); form.set("email", "student@example.com");

    await expect(requestSignupToken({}, form)).resolves.toHaveProperty("error");
    expect(mocks.sendInvite).not.toHaveBeenCalled();
  });
});
