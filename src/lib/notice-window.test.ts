import { describe, expect, it } from "vitest";
import {
  buildNoticeWindow,
  formatNoticeWindowLabel,
  getDetailedNoticeDateRangeFromDuration,
  getNoticeFormDateRange,
  getNoticeVisibilityWhere,
  getNoticeWindowPreview,
  getSimpleNoticeWindowPreview,
  isNoticeVisibleAt,
} from "@/lib/notice-window";

describe("notice-window", () => {
  it("builds the detailed KST visibility window from selected dates", () => {
    const window = buildNoticeWindow({
      unlimited: false,
      detailedPeriod: true,
      startDate: "2026-03-28",
      endDate: "2026-03-30",
    });

    expect(window.startsAt?.toISOString()).toBe("2026-03-28T10:00:00.000Z");
    expect(window.expiresAt?.toISOString()).toBe("2026-03-30T20:00:00.000Z");
  });

  it("builds the simple visibility window from a day duration", () => {
    const window = buildNoticeWindow({
      unlimited: false,
      detailedPeriod: false,
      duration: "7",
      startDate: null,
      endDate: null,
      now: new Date("2026-03-28T01:23:00.000Z"),
    });

    expect(window.startsAt).toBeNull();
    expect(window.expiresAt?.toISOString()).toBe("2026-04-04T01:23:00.000Z");
  });

  it("treats unlimited notices as always visible", () => {
    const window = buildNoticeWindow({
      unlimited: true,
      startDate: null,
      endDate: null,
    });

    expect(window).toEqual({ startsAt: null, expiresAt: null });
    expect(formatNoticeWindowLabel(window)).toBe("상시 공지");
  });

  it("reconstructs detailed form values from a saved window", () => {
    const range = getNoticeFormDateRange(
      {
        startsAt: new Date("2026-03-28T10:00:00.000Z"),
        expiresAt: new Date("2026-03-30T20:00:00.000Z"),
      },
      new Date("2026-03-28T00:00:00.000Z"),
    );

    expect(range).toEqual({
      unlimited: false,
      detailedPeriod: true,
      duration: "7",
      startDate: "2026-03-28",
      endDate: "2026-03-30",
    });
  });

  it("reconstructs simple form values from a saved window", () => {
    const range = getNoticeFormDateRange(
      {
        startsAt: null,
        expiresAt: new Date("2026-04-04T01:23:00.000Z"),
      },
      new Date("2026-03-28T01:23:00.000Z"),
    );

    expect(range).toEqual({
      unlimited: false,
      detailedPeriod: false,
      duration: "7",
      startDate: "2026-03-28",
      endDate: "2026-04-04",
    });
  });

  it("formats a human-readable detailed visibility preview", () => {
    expect(getNoticeWindowPreview("2026-03-28", "2026-03-30")).toBe("2026.03.28 19:00 ~ 2026.03.31 05:00");
  });

  it("formats a human-readable simple visibility preview", () => {
    expect(getSimpleNoticeWindowPreview("5")).toBe("작성 시점부터 5일 동안 공지가 노출됩니다.");
  });

  it("maps a simple duration to a detailed date range using today as day one", () => {
    expect(getDetailedNoticeDateRangeFromDuration("7", new Date("2026-03-29T03:00:00.000Z"))).toEqual({
      startDate: "2026-03-29",
      endDate: "2026-04-04",
    });
  });

  it("formats simple notices with an end timestamp label", () => {
    expect(
      formatNoticeWindowLabel({
        startsAt: null,
        expiresAt: new Date("2026-04-04T01:23:00.000Z"),
      }),
    ).toBe("2026.04.04 10:23까지");
  });

  it("evaluates visibility against the current time", () => {
    expect(
      isNoticeVisibleAt(
        {
          startsAt: new Date("2026-03-28T10:00:00.000Z"),
          expiresAt: new Date("2026-03-30T20:00:00.000Z"),
        },
        new Date("2026-03-29T00:00:00.000Z"),
      ),
    ).toBe(true);

    expect(
      isNoticeVisibleAt(
        {
          startsAt: new Date("2026-03-28T10:00:00.000Z"),
          expiresAt: new Date("2026-03-30T20:00:00.000Z"),
        },
        new Date("2026-03-28T09:59:59.000Z"),
      ),
    ).toBe(false);
  });

  it("builds a query that filters by start and end timestamps", () => {
    expect(getNoticeVisibilityWhere(new Date("2026-03-29T00:00:00.000Z"))).toEqual({
      AND: [
        {
          OR: [{ startsAt: null }, { startsAt: { lte: new Date("2026-03-29T00:00:00.000Z") } }],
        },
        {
          OR: [{ expiresAt: null }, { expiresAt: { gt: new Date("2026-03-29T00:00:00.000Z") } }],
        },
      ],
    });
  });
});
