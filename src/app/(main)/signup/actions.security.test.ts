import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  preflight: vi.fn(), redeem: vi.fn(), hash: vi.fn(),
  limiterCheck: vi.fn(), recordAttempt: vi.fn(),
  clientAddress: vi.fn(),
}));
vi.mock("bcryptjs", () => ({ default: { hash: mocks.hash } }));
vi.mock("@/lib/member-service-suspension", () => ({ MEMBER_SERVICE_SUSPENDED: false }));
vi.mock("@/lib/db", () => ({ prisma: {} }));
vi.mock("@/lib/signup-rate-limit", () => ({
  signupAttemptLimiter: { check: mocks.limiterCheck, recordAttempt: mocks.recordAttempt },
}));
vi.mock("@/lib/security/principal-key", () => ({
  getApplicationSecuritySecret: () => "test-secret",
  hashSecurityPrincipal: (namespace: string, value: string) => `${namespace}:${value}`,
  networkPrincipal: (address: string | null) => address ?? "unknown",
}));
vi.mock("@/lib/security/client-address", () => ({
  parseTrustedProxyHops: () => 1,
  resolveTrustedClientAddress: mocks.clientAddress,
  isSensitiveClientAddressTrusted: (address: string | null, hops: number) => hops === 0 || address !== null,
}));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "192.0.2.10" }) }));
vi.mock("@/lib/invite-redemption", () => ({
  InviteRedemptionError: class InviteRedemptionError extends Error {
    constructor(public code: string) { super(code); }
  },
  preflightInviteRedemption: mocks.preflight,
  redeemInvite: mocks.redeem,
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

function validForm() {
  const form = new FormData();
  form.set("token", "safe-token"); form.set("userId", "student01");
  form.set("password", "safe-new-password-2026"); form.set("confirmPassword", "safe-new-password-2026");
  form.set("name", "Student"); form.set("email", "student@example.com"); form.set("studentId", "1304");
  return form;
}

function validFormWithUserId(userId: string) {
  const form = validForm();
  form.set("userId", userId);
  return form;
}

describe("signup cost ordering", () => {
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.hash.mockResolvedValue("hash");
    mocks.redeem.mockResolvedValue({});
    mocks.limiterCheck.mockReturnValue({ locked: false });
    mocks.clientAddress.mockReturnValue("192.0.2.10");
  });

  it("does not run bcrypt for an invalid, expired, used, or identity-mismatched invite", async () => {
    const { InviteRedemptionError } = await import("@/lib/invite-redemption");
    mocks.preflight.mockRejectedValue(new InviteRedemptionError("INVALID"));
    const { signup } = await import("./actions");
    await expect(signup(validForm())).resolves.toHaveProperty("error");
    expect(mocks.recordAttempt).toHaveBeenCalledTimes(1);
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.redeem).not.toHaveBeenCalled();
  });

  it("preflights the invite before hashing and still uses atomic redemption afterward", async () => {
    mocks.preflight.mockResolvedValue({ id: "invite" });
    const { signup } = await import("./actions");
    await signup(validForm());
    expect(mocks.limiterCheck.mock.invocationCallOrder[0]).toBeLessThan(mocks.recordAttempt.mock.invocationCallOrder[0]);
    expect(mocks.recordAttempt.mock.invocationCallOrder[0]).toBeLessThan(mocks.preflight.mock.invocationCallOrder[0]);
    expect(mocks.preflight.mock.invocationCallOrder[0]).toBeLessThan(mocks.hash.mock.invocationCallOrder[0]);
    expect(mocks.hash.mock.invocationCallOrder[0]).toBeLessThan(mocks.redeem.mock.invocationCallOrder[0]);
  });

  it("rechecks invite expiry against claim time after the password hash completes", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T00:00:00.000Z"));
    mocks.preflight.mockResolvedValue({ id: "invite" });
    mocks.hash.mockImplementation(async () => {
      vi.setSystemTime(new Date("2026-08-13T00:00:01.000Z"));
      return "hash";
    });
    const { signup } = await import("./actions");

    await signup(validForm());

    expect(mocks.preflight.mock.calls[0][1].now).toEqual(new Date("2026-08-13T00:00:00.000Z"));
    expect(mocks.redeem.mock.calls[0][1].now).toEqual(new Date("2026-08-13T00:00:01.000Z"));
  });

  it("rejects a locked identifier or network before invite lookup and bcrypt", async () => {
    mocks.limiterCheck.mockReturnValue({ locked: true });
    const { signup } = await import("./actions");

    await expect(signup(validForm())).resolves.toEqual({ error: "Too many signup attempts. Please wait before trying again." });

    expect(mocks.preflight).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
    expect(mocks.redeem).not.toHaveBeenCalled();
  });

  it("does not fan out bcrypt for parallel user IDs presenting the same invite", async () => {
    mocks.preflight.mockResolvedValue({ id: "invite" });
    let releaseHash!: () => void;
    mocks.hash.mockImplementationOnce(() => new Promise<string>((resolve) => {
      releaseHash = () => resolve("hash");
    }));
    const { signup } = await import("./actions");

    const first = signup(validFormWithUserId("student01"));
    await vi.waitFor(() => expect(mocks.hash).toHaveBeenCalledTimes(1));
    await expect(signup(validFormWithUserId("student02"))).resolves.toHaveProperty("error");
    expect(mocks.preflight).toHaveBeenCalledTimes(1);
    expect(mocks.hash).toHaveBeenCalledTimes(1);
    releaseHash();
    await first;
  });

  it("rejects a missing trusted proxy address before lookup or bcrypt", async () => {
    mocks.clientAddress.mockReturnValueOnce(null);
    const { signup } = await import("./actions");
    await expect(signup(validForm())).resolves.toHaveProperty("error");
    expect(mocks.preflight).not.toHaveBeenCalled();
    expect(mocks.hash).not.toHaveBeenCalled();
  });
});
