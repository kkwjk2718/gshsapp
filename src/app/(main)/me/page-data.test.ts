import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }));
vi.mock("@/lib/db", () => ({ prisma: { user: { findUnique } } }));

describe("me page data boundary", () => {
  it("selects and returns only fields rendered by the page and client profile", async () => {
    findUnique.mockResolvedValue({
      name: "Student",
      email: "student@example.com",
      studentId: "1101",
      gisu: 42,
      personalEvents: [{ id: "event-1", title: "시험", targetDate: new Date("2026-08-20"), isPrimary: true }],
      songRequests: [{ id: "song-1", videoTitle: "Song", status: "PENDING", createdAt: new Date("2026-08-12") }],
    });
    const { loadMePageData, ME_PAGE_USER_SELECT } = await import("./page-data");

    const result = await loadMePageData("user-1");

    expect(findUnique).toHaveBeenCalledWith({ where: { id: "user-1" }, select: ME_PAGE_USER_SELECT });
    expect(ME_PAGE_USER_SELECT).toEqual({
      name: true,
      email: true,
      studentId: true,
      gisu: true,
      personalEvents: {
        orderBy: { targetDate: "asc" },
        select: { id: true, title: true, targetDate: true, isPrimary: true },
      },
      songRequests: {
        orderBy: { createdAt: "desc" },
        take: 5,
        select: { id: true, videoTitle: true, status: true, createdAt: true },
      },
    });
    expect(result?.profile).toEqual({
      name: "Student",
      email: "student@example.com",
      studentId: "1101",
      gisu: 42,
    });
    expect(JSON.stringify(result)).not.toMatch(/passwordHash|sessionVersion|role|teacherProfile|notifications/);
  });
});
