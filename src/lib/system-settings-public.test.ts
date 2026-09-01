import { describe, expect, it } from "vitest";

import { publicTokenPortalSettings } from "@/lib/system-settings";

describe("public token portal settings DTO", () => {
  it("never carries the shared password hash across the public render boundary", () => {
    const result = publicTokenPortalSettings({
      enabled: true,
      hasPassword: true,
      passwordHash: "sensitive-hash",
      sessionVersion: 4,
      guidance: "Ask an administrator",
    });

    expect(result).toEqual({
      enabled: true,
      hasPassword: true,
      sessionVersion: 4,
      guidance: "Ask an administrator",
    });
    expect(result).not.toHaveProperty("passwordHash");
  });
});
