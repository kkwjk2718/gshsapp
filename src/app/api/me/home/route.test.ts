import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findPersonalEvent: vi.fn(),
  getCalendarSchedules: vi.fn(),
  getCurrentUser: vi.fn(),
  getTimetable: vi.fn(),
  getUserGrade: vi.fn(),
}));

vi.mock("@/lib/db", () => ({
  prisma: { personalEvent: { findFirst: mocks.findPersonalEvent } },
}));
vi.mock("@/lib/neis", () => ({ getTimetable: mocks.getTimetable }));
vi.mock("@/lib/grade-utils", () => ({ getUserGrade: mocks.getUserGrade }));
vi.mock("@/lib/date-utils", () => ({
  getKSTDate: () => new Date("2026-08-13T12:00:00.000Z"),
  getKSTDateKey: () => "20260813",
}));
vi.mock("@/lib/public-content", () => ({ getCalendarSchedules: mocks.getCalendarSchedules }));
vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));

import { GET } from "./route";

describe("home personalization calendar summary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({
      id: "admin-1",
      role: "ADMIN",
      name: "Admin",
      studentId: null,
      gisu: null,
    });
    mocks.findPersonalEvent.mockResolvedValue(null);
    mocks.getUserGrade.mockResolvedValue(null);
    mocks.getTimetable.mockResolvedValue([]);
  });

  it("keeps external DTO events behind school events in the daily summary", async () => {
    mocks.getCalendarSchedules.mockResolvedValue([
      {
        id: "external-1",
        title: "External event",
        description: null,
        startDate: "2026-08-13T00:00:00.000Z",
        endDate: "2026-08-13T23:59:59.000Z",
        category: "EXTERNAL",
      },
      {
        id: "school-1",
        title: "School event",
        description: null,
        startDate: "2026-08-13T00:00:00.000Z",
        endDate: "2026-08-13T23:59:59.000Z",
        category: "ACADEMIC",
      },
    ]);

    const response = await GET();
    const payload = await response.json();

    expect(payload.todayScheduleSummary).toMatch(/^School event /);
  });
});
