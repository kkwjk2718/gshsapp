import { describe, expect, it } from "vitest";

import { parseInviteTokenFragment, stripInviteTokenFromLocation } from "./signup-token-handoff";

describe("signup token browser handoff", () => {
  it("accepts a bounded token from the URL fragment only", () => {
    expect(parseInviteTokenFragment("#token=safe_secret-123")).toBe("safe_secret-123");
    expect(parseInviteTokenFragment("?token=query-secret")).toBeNull();
    expect(parseInviteTokenFragment(`#token=${"x".repeat(129)}`)).toBeNull();
    expect(parseInviteTokenFragment("#token=bad%00secret")).toBeNull();
  });

  it("removes legacy token query parameters and the fragment from browser history", () => {
    expect(stripInviteTokenFromLocation("/signup", "?token=legacy&next=help"))
      .toBe("/signup?next=help");
    expect(stripInviteTokenFromLocation("/signup", "")).toBe("/signup");
  });
});
