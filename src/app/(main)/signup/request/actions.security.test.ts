import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  settings: vi.fn(), compare: vi.fn(), hasSession: vi.fn(), sendInvite: vi.fn(),
}));
vi.mock("@/lib/member-service-suspension", () => ({ MEMBER_SERVICE_SUSPENDED: false }));
vi.mock("bcryptjs", () => ({ default: { compare: mocks.compare } }));
vi.mock("@/lib/system-settings", () => ({ getTokenPortalSettings: mocks.settings }));
vi.mock("@/lib/token-portal-session", () => ({
  getPortalClientKey: vi.fn(), hasValidPortalSession: mocks.hasSession, setPortalSessionCookie: vi.fn(),
}));
vi.mock("@/lib/token-portal", () => ({ sendPortalStudentInvite: mocks.sendInvite }));
vi.mock("@/lib/logger", () => ({ logAction: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));

describe("portal action cheap rejection", () => {
  beforeEach(() => vi.clearAllMocks());

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
});
