import { describe, expect, it, vi } from "vitest";

import { validatePortalRosterIdentity } from "./student-roster";

describe("portal student roster", () => {
  it("requires an exact active, unused identity in the current academic generation", async () => {
    const findFirst = vi.fn().mockResolvedValue({
      id: "roster-2026-1",
      academicYear: 2026,
      gisu: 42,
      studentId: "1304",
      name: "Student One",
      email: "student@example.com",
      active: true,
      claimedAt: null,
      claimedInviteTokenId: null,
      claimedUserId: null,
    });
    const db = { studentRosterEntry: { findFirst } } as never;

    await expect(validatePortalRosterIdentity(db, {
      name: "Student One", studentId: "1304", email: "student@example.com",
    })).resolves.toMatchObject({ id: "roster-2026-1", academicYear: 2026, gisu: 42, studentId: "1304" });
    await expect(validatePortalRosterIdentity(db, {
      name: "Other Student", studentId: "1304", email: "student@example.com",
    })).resolves.toBeNull();
    await expect(validatePortalRosterIdentity(db, {
      name: "Student One", studentId: "1304", email: "attacker@example.com",
    })).resolves.toBeNull();

    findFirst.mockResolvedValueOnce({
      id: "roster-2026-1", academicYear: 2026, gisu: 42, studentId: "1304", name: "Student One",
      email: "student@example.com", active: true, claimedAt: new Date(), claimedInviteTokenId: null, claimedUserId: "user-1",
    });
    await expect(validatePortalRosterIdentity(db, {
      name: "Student One", studentId: "1304", email: "student@example.com",
    })).resolves.toBeNull();

    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: expect.objectContaining({ active: true, studentId: "1304", email: "student@example.com" }),
    }));
  });

  it("never accepts a missing roster row", async () => {
    const db = { studentRosterEntry: { findFirst: vi.fn().mockResolvedValue(null) } } as never;
    await expect(validatePortalRosterIdentity(db, {
      name: "Student One", studentId: "1304", email: "student@example.com",
    })).resolves.toBeNull();
  });
});
