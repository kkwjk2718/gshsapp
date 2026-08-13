import { describe, expect, it } from "vitest";

import { canChangeGisu } from "@/lib/user-roles";

describe("authoritative cohort policy", () => {
  it("never exposes direct cohort editing for roster-governed roles", () => {
    expect(canChangeGisu("STUDENT")).toBe(false);
    expect(canChangeGisu("BROADCAST")).toBe(false);
    expect(canChangeGisu("GRADUATE")).toBe(true);
  });
});
