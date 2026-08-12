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

describe("iCal event boundary", () => {
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
});
