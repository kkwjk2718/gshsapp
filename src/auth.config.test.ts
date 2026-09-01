import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/member-service-suspension", () => ({ MEMBER_SERVICE_SUSPENDED: false }));
import { authConfig } from "./auth.config";

describe("auth session version callbacks", () => {
  it("copies the numeric user version into the JWT only on sign-in", async () => {
    const jwt = authConfig.callbacks?.jwt;
    if (!jwt) throw new Error("jwt callback missing");

    const signedIn = await jwt({
      token: { sub: "user-1" },
      user: { id: "user-1", sessionVersion: 7 },
      account: null,
      profile: undefined,
      trigger: "signIn",
      isNewUser: false,
    } as never);
    expect(signedIn.sessionVersion).toBe(7);

    const refreshed = await jwt({
      token: signedIn,
      account: null,
      profile: undefined,
      trigger: "update",
      isNewUser: false,
      session: {},
    } as never);
    expect(refreshed.sessionVersion).toBe(7);
  });

  it("does not invent a version for a legacy JWT", async () => {
    const session = authConfig.callbacks?.session;
    if (!session) throw new Error("session callback missing");

    const result = await session({
      session: { user: { id: "user-1", name: "Legacy", email: "legacy@example.com" }, expires: new Date() },
      token: { sub: "user-1" },
    } as never);
    expect(result.user.sessionVersion).toBeUndefined();
  });

  it("propagates forced-rotation state and redirects protected navigation to the password surface", async () => {
    const jwt = authConfig.callbacks?.jwt;
    const sessionCallback = authConfig.callbacks?.session;
    const authorized = authConfig.callbacks?.authorized;
    if (!jwt || !sessionCallback || !authorized) throw new Error("auth callback missing");
    const token = await jwt({ token: { sub: "user-1" }, user: { id: "user-1", sessionVersion: 7, mustChangePassword: true } } as never);
    const session = await sessionCallback({ session: { user: {}, expires: new Date() }, token } as never);
    expect(session.user.mustChangePassword).toBe(true);

    const result = await authorized({
      auth: session,
      request: { nextUrl: new URL("https://gshs.app/admin") },
    } as never);
    expect(result).toBeInstanceOf(Response);
    expect((result as Response).headers.get("location")).toBe("https://gshs.app/me?forcePasswordChange=1");
  });
});
