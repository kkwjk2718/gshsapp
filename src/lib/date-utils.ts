import { addHours, startOfDay, subDays, addDays } from "date-fns";
import { format, toZonedTime } from "date-fns-tz";

const SEOUL_TZ = "Asia/Seoul";

/**
 * Returns current KST time
 */
export function getKSTDate() {
    const now = new Date();
    return toZonedTime(now, SEOUL_TZ);
}

/**
 * Returns true if current time is within 05:00 ~ 07:00 (Break Time)
 */
export function isBreakTime() {
    const now = getKSTDate();
    const currentHour = now.getHours();
    // 05:00 <= NOW < 07:00
    return currentHour >= 5 && currentHour < 7;
}

/**
 * Calculate the time ranges for songs
 */
export function getSongTimeRanges() {
    const now = getKSTDate();
    const currentHour = now.getHours();

    // If now is before 05:00, we are still in the "previous day's" cycle effectively for morning songs?
    // No, let's stick to the definition:
    // Today's Morning Song (Played at Today 06:20): Requested (T-1) 07:00 ~ (T) 05:00
    // Next Morning Song (Played at T+1 06:20): Requested (T) 07:00 ~ (T+1) 05:00

    // However, if strict break time is enforced, the day switch happens at 07:00.

    const todayStart = startOfDay(now);

    // T-1 07:00
    const yesterday0700 = addHours(subDays(todayStart, 1), 7);
    // T 05:00
    const today0500 = addHours(todayStart, 5);
    // T 07:00
    const today0700 = addHours(todayStart, 7);
    // T+1 05:00
    const tomorrow0500 = addHours(addDays(todayStart, 1), 5); // Cannot find name 'addDays' -> need import

    return {
        todayMorning: { start: yesterday0700, end: today0500 },
        nextMorning: { start: today0700, end: tomorrow0500 }
    };
}
