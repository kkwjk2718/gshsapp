import { describe, expect, it } from "vitest";
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
});
