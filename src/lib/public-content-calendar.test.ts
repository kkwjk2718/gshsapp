import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  findSchedules: vi.fn(),
  findSetting: vi.fn(),
  getICal: vi.fn(),
  getNeis: vi.fn(),
}));

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }));
vi.mock("@/lib/db", () => ({
  prisma: {
    notice: { findMany: vi.fn() },
    schedule: { findFirst: vi.fn(), findMany: mocks.findSchedules },
    relatedSite: { findMany: vi.fn() },
    user: { findMany: vi.fn() },
    systemSetting: { findUnique: mocks.findSetting },
  },
}));
vi.mock("@/lib/google-calendar", () => ({ getEventsFromICal: mocks.getICal }));
vi.mock("@/lib/neis", () => ({ getSchoolSchedule: mocks.getNeis }));

import { getCalendarSchedules } from "@/lib/public-content";

describe("public calendar data boundary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-13T00:00:00.000Z"));
    vi.clearAllMocks();
    mocks.findSetting.mockResolvedValue({ value: "https://calendar.google.com/calendar/ical/x/basic.ics" });
    mocks.findSchedules.mockResolvedValue([
      {
        id: "db-1",
        writerId: "secret-writer",
        title: "DB event",
        description: "description",
        startDate: new Date("2026-08-13T01:00:00.000Z"),
        endDate: new Date("2026-08-13T02:00:00.000Z"),
        category: "ACADEMIC",
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    ]);
    mocks.getICal.mockResolvedValue([
      {
        id: "ical-1",
        title: "External event",
        description: null,
        startDate: new Date("2026-08-14T01:00:00.000Z"),
        endDate: new Date("2026-08-14T02:00:00.000Z"),
        category: "EXTERNAL",
        hidden: "must-not-pass",
      },
    ]);
    mocks.getNeis.mockResolvedValue([
      {
        AY: "2026",
        AA_YMD: "20260815",
        EVENT_NM: "NEIS event",
        EVENT_CNTNT: "NEIS description",
        unexpected: "must-not-pass",
      },
    ]);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("selects only public DB fields and maps every source to one bounded DTO", async () => {
    const result = await getCalendarSchedules();

    expect(mocks.findSchedules).toHaveBeenCalledWith({
      where: {
        startDate: { lte: new Date("2027-12-31T23:59:59.999Z") },
        endDate: { gte: new Date("2025-01-01T00:00:00.000Z") },
      },
      orderBy: { startDate: "asc" },
      take: 500,
      select: {
        id: true,
        title: true,
        description: true,
        startDate: true,
        endDate: true,
        category: true,
      },
    });
    expect(result).toEqual([
      {
        id: "db-1",
        title: "DB event",
        description: "description",
        startDate: "2026-08-13T01:00:00.000Z",
        endDate: "2026-08-13T02:00:00.000Z",
        category: "ACADEMIC",
      },
      {
        id: "ical-1",
        title: "External event",
        description: null,
        startDate: "2026-08-14T01:00:00.000Z",
        endDate: "2026-08-14T02:00:00.000Z",
        category: "EXTERNAL",
      },
      {
        id: "neis-20260815-NEIS event",
        title: "NEIS event",
        description: "NEIS description",
        startDate: "2026-08-15T00:00:00.000Z",
        endDate: "2026-08-15T00:00:00.000Z",
        category: "NEIS",
      },
    ]);
    expect(JSON.stringify(result)).not.toMatch(/writerId|createdAt|secret-writer|hidden|unexpected/);
  });
});
