import { describe, expect, it } from "vitest";
import { parseICalEvents } from "@/lib/google-calendar";

function event(index: number, start = "20260813T010000Z", end = "20260813T020000Z") {
  return [
    "BEGIN:VEVENT",
    `UID:event-${index}`,
    `DTSTART:${start}`,
    `DTEND:${end}`,
    `SUMMARY:${"T".repeat(250)}`,
    `DESCRIPTION:${"D".repeat(2100)}`,
    "END:VEVENT",
  ].join("\r\n");
}

function compactEvent(index: number) {
  return [
    "BEGIN:VEVENT",
    `UID:compact-${index}`,
    "DTSTART:20260813T010000Z",
    "DTEND:20260813T020000Z",
    "SUMMARY:T",
    "END:VEVENT",
  ].join("\r\n");
}

describe("iCal event boundary", () => {
  it("rejects reserved UID keys without mutating Object.prototype", () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:__proto__",
      "DTSTART:20260813T010000Z",
      "DTEND:20260813T020000Z",
      "SUMMARY:prototype-pollution-sentinel",
      "DESCRIPTION:must-not-escape-the-parser",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");
    const originalKeys = new Set(Object.getOwnPropertyNames(Object.prototype));

    try {
      expect(parseICalEvents(calendar, new Date("2026-08-13T00:00:00.000Z"))).toEqual([]);
      expect(({} as { summary?: unknown }).summary).toBeUndefined();
      expect(({} as { description?: unknown }).description).toBeUndefined();
    } finally {
      for (const key of Object.getOwnPropertyNames(Object.prototype)) {
        if (!originalKeys.has(key)) delete (Object.prototype as Record<string, unknown>)[key];
      }
    }
  });

  it("rejects reserved iCal property names before invoking the parser", () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:safe-id",
      "DTSTART:20260813T010000Z",
      "DTEND:20260813T020000Z",
      "SUMMARY:T",
      "__proto__:must-not-reach-parser-state",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseICalEvents(calendar, new Date("2026-08-13T00:00:00.000Z"))).toEqual([]);
  });

  it("bounds fields and rejects events outside the public calendar date window", () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      event(1),
      event(2, "20350101T010000Z", "20350101T020000Z"),
      "END:VCALENDAR",
    ].join("\r\n");

    const result = parseICalEvents(calendar, new Date("2026-08-13T00:00:00.000Z"));

    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ id: "event-1", category: "EXTERNAL" });
    expect(result[0].title).toHaveLength(200);
    expect(result[0].description).toHaveLength(2000);
  });

  it("returns at most 500 events", () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      ...Array.from({ length: 501 }, (_, index) => event(index)),
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseICalEvents(calendar, new Date("2026-08-13T00:00:00.000Z"))).toHaveLength(500);
  });

  it("rejects excessive event definitions before parsing the feed", () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      ...Array.from({ length: 1_001 }, (_, index) => compactEvent(index)),
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseICalEvents(calendar, new Date("2026-08-13T00:00:00.000Z"))).toEqual([]);
  });

  it("rejects oversized unfolded property values before parsing the feed", () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:long-property",
      "DTSTART:20260813T010000Z",
      "DTEND:20260813T020000Z",
      `SUMMARY:${"T".repeat(32_768)}`,
      ` ${"T".repeat(32_769)}`,
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseICalEvents(calendar, new Date("2026-08-13T00:00:00.000Z"))).toEqual([]);
  });

  it("rejects excessive logical properties before synchronous parsing", () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:many-properties",
      "DTSTART:20260813T010000Z",
      "DTEND:20260813T020000Z",
      "SUMMARY:T",
      ...Array.from({ length: 20_001 }, () => "X-CUSTOM:value"),
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseICalEvents(calendar, new Date("2026-08-13T00:00:00.000Z"))).toEqual([]);
  });

  it("rejects excessive folds on one property before synchronous parsing", () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:many-folds",
      "DTSTART:20260813T010000Z",
      "DTEND:20260813T020000Z",
      "SUMMARY:T",
      ...Array.from({ length: 1_025 }, () => " "),
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseICalEvents(calendar, new Date("2026-08-13T00:00:00.000Z"))).toEqual([]);
  });

  it("rejects oversized UID keys before the parser allocates calendar properties", () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      `UID:${"u".repeat(513)}`,
      "DTSTART:20260813T010000Z",
      "DTEND:20260813T020000Z",
      "SUMMARY:T",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseICalEvents(calendar, new Date("2026-08-13T00:00:00.000Z"))).toEqual([]);
  });

  it("rejects inverted and excessively long event spans", () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      event(1, "20260814T010000Z", "20260813T010000Z"),
      event(2, "20260101T010000Z", "20270103T010000Z"),
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseICalEvents(calendar, new Date("2026-08-13T00:00:00.000Z"))).toEqual([]);
  });

  it("preserves TZID conversion and the base event of a recurrence rule", () => {
    const calendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:recurring-seoul-event",
      "DTSTART;TZID=Asia/Seoul:20260813T090000",
      "DTEND;TZID=Asia/Seoul:20260813T100000",
      "RRULE:FREQ=DAILY;COUNT=2",
      "SUMMARY:Recurring event",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    expect(parseICalEvents(calendar, new Date("2026-08-13T00:00:00.000Z"))).toEqual([
      expect.objectContaining({
        id: "recurring-seoul-event",
        startDate: new Date("2026-08-13T00:00:00.000Z"),
        endDate: new Date("2026-08-13T01:00:00.000Z"),
      }),
    ]);
  });
});
