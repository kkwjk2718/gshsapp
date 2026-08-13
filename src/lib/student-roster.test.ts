import { describe, expect, it, vi } from "vitest";

import { validatePortalRosterIdentity } from "./student-roster";

describe("portal student roster", () => {
  it("requires an exact active, unused name and student-id match", async () => {
    const findUnique = vi.fn().mockResolvedValue({ studentId: "1304", name: "홍길동", email: "student@example.com", active: true, claimedAt: null, claimedInviteTokenId: null, claimedUserId: null });
    const db = { studentRosterEntry: { findUnique } } as never;

    await expect(validatePortalRosterIdentity(db, { name: "홍길동", studentId: "1304", email: "student@example.com" }))
      .resolves.toMatchObject({ studentId: "1304" });
    await expect(validatePortalRosterIdentity(db, { name: "다른이름", studentId: "1304", email: "student@example.com" }))
      .resolves.toBeNull();
    await expect(validatePortalRosterIdentity(db, { name: "홍길동", studentId: "1304", email: "attacker@example.com" }))
      .resolves.toBeNull();
    findUnique.mockResolvedValueOnce({ studentId: "1304", name: "홍길동", email: "student@example.com", active: true, claimedAt: new Date(), claimedInviteTokenId: null, claimedUserId: "user-1" });
    await expect(validatePortalRosterIdentity(db, { name: "홍길동", studentId: "1304", email: "student@example.com" }))
      .resolves.toBeNull();
  });

  it("normalizes names but never accepts a missing roster row", async () => {
    const db = { studentRosterEntry: { findUnique: vi.fn().mockResolvedValue(null) } } as never;
    await expect(validatePortalRosterIdentity(db, { name: " 홍길동 ", studentId: "1304", email: "student@example.com" })).resolves.toBeNull();
  });
});
