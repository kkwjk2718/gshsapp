import ical from "node-ical";

export interface ICalEvent {
    id: string;
    title: string;
    description: string | null;
    startDate: Date;
    endDate: Date;
    isExternal: true; // Flag to identify these events
}

export async function getEventsFromICal(url: string): Promise<ICalEvent[]> {
    if (!url || !url.startsWith("http")) {
        return [];
    }

    try {
        const events = await ical.async.fromURL(url);
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
