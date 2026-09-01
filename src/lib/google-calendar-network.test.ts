import { Readable } from "node:stream";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createPinnedLookup: vi.fn(() => vi.fn()),
  httpsRequest: vi.fn(),
  resolveAllowedICalTarget: vi.fn(),
}));

vi.mock("node:https", () => ({ request: mocks.httpsRequest }));
vi.mock("@/lib/network-safety", () => ({
  createPinnedLookup: mocks.createPinnedLookup,
  resolveAllowedICalTarget: mocks.resolveAllowedICalTarget,
}));

import { getEventsFromICal } from "@/lib/google-calendar";

describe("pinned iCal transport", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.resolveAllowedICalTarget.mockResolvedValue({
      url: new URL("https://calendar.google.com/calendar/ical/example/basic.ics"),
      address: { address: "142.250.66.78", family: 4 },
    });
  });

  it("disables pooled sockets so every request uses the validated pinned lookup", async () => {
    const rawCalendar = [
      "BEGIN:VCALENDAR",
      "VERSION:2.0",
      "BEGIN:VEVENT",
      "UID:pinned-event",
      "DTSTART:20260813T010000Z",
      "DTEND:20260813T020000Z",
      "SUMMARY:Pinned event",
      "END:VEVENT",
      "END:VCALENDAR",
    ].join("\r\n");

    mocks.httpsRequest.mockImplementation((options, callback) => {
      const response = Readable.from([rawCalendar]) as Readable & {
        statusCode: number;
        headers: Record<string, string>;
      };
      response.statusCode = 200;
      response.headers = { "content-type": "text/calendar" };
      callback(response);
      return {
        once: vi.fn().mockReturnThis(),
        end: vi.fn(),
      };
    });

    await expect(getEventsFromICal("https://calendar.google.com/calendar/ical/example/basic.ics"))
      .resolves.toEqual([expect.objectContaining({ id: "pinned-event" })]);

    expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
    expect(mocks.httpsRequest.mock.calls[0][0]).toEqual(expect.objectContaining({
      agent: false,
      family: 4,
      hostname: "calendar.google.com",
      servername: "calendar.google.com",
    }));
    expect(mocks.createPinnedLookup).toHaveBeenCalledWith({ address: "142.250.66.78", family: 4 });
  });

  it("rejects redirects without issuing a request to the redirect target", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.httpsRequest.mockImplementation((_options, callback) => {
      const response = Readable.from([]) as Readable & {
        statusCode: number;
        headers: Record<string, string>;
      };
      response.statusCode = 302;
      response.headers = { location: "https://127.0.0.1/private.ics" };
      callback(response);
      return {
        once: vi.fn().mockReturnThis(),
        end: vi.fn(),
      };
    });

    try {
      await expect(getEventsFromICal("https://calendar.google.com/calendar/ical/example/basic.ics"))
        .resolves.toEqual([]);
      expect(mocks.httpsRequest).toHaveBeenCalledTimes(1);
    } finally {
      log.mockRestore();
    }
  });
});
