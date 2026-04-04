import ical from "node-ical";
import { assertSafeExternalHttpsUrl } from "@/lib/network-safety";

export interface ICalEvent {
    id: string;
    title: string;
    description: string | null;
    startDate: Date;
    endDate: Date;
    isExternal: true; // Flag to identify these events
}

export async function getEventsFromICal(url: string): Promise<ICalEvent[]> {
    if (!url) {
        return [];
    }

    try {
        const safeUrl = await assertSafeExternalHttpsUrl(url);
        const response = await fetch(safeUrl, {
            method: "GET",
            redirect: "error",
            signal: AbortSignal.timeout(10_000),
            headers: {
                accept: "text/calendar, text/plain;q=0.9, */*;q=0.1",
            },
        });

        if (!response.ok) {
            throw new Error(`iCal fetch failed with status ${response.status}`);
        }

        const contentLength = Number.parseInt(response.headers.get("content-length") || "", 10);
        if (Number.isFinite(contentLength) && contentLength > 1_500_000) {
            throw new Error("iCal feed is too large.");
        }

        const rawCalendar = await response.text();
        const events = ical.sync.parseICS(rawCalendar);
        const parsedEvents: ICalEvent[] = [];

        for (const key in events) {
            const event = events[key];
            if (event.type === 'VEVENT' && event.summary && event.start && event.end) {
                parsedEvents.push({
                    id: event.uid || key,
                    title: event.summary,
                    description: event.description || null,
                    startDate: new Date(event.start),
                    endDate: new Date(event.end),
                    isExternal: true,
                });
            }
        }
        return parsedEvents;
    } catch (error) {
        console.error("Failed to fetch or parse iCal feed:", error);
        return [];
    }
}
