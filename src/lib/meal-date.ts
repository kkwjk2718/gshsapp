import { format } from "date-fns";

export interface ResolvedMealDate {
  date: Date;
  dateKey: string;
  year: string;
  month: string;
  usedFallback: boolean;
}

function toResolvedMealDate(date: Date, usedFallback: boolean): ResolvedMealDate {
  return {
    date,
    dateKey: format(date, "yyyyMMdd"),
    year: format(date, "yyyy"),
    month: format(date, "MM"),
    usedFallback,
  };
}

export function resolveMealDateQuery(rawDate: unknown, now: Date): ResolvedMealDate {
  const fallback = new Date(now);
  if (typeof rawDate !== "string" || !/^\d{8}$/.test(rawDate)) {
    return toResolvedMealDate(fallback, true);
  }

  const year = Number.parseInt(rawDate.slice(0, 4), 10);
  const month = Number.parseInt(rawDate.slice(4, 6), 10);
  const day = Number.parseInt(rawDate.slice(6, 8), 10);
  const currentYear = now.getFullYear();

  if (year < currentYear - 1 || year > currentYear + 1) {
    return toResolvedMealDate(fallback, true);
  }

  const parsed = new Date(year, month - 1, day);
  if (
    parsed.getFullYear() !== year ||
    parsed.getMonth() !== month - 1 ||
    parsed.getDate() !== day
  ) {
    return toResolvedMealDate(fallback, true);
  }

  return toResolvedMealDate(parsed, false);
}

export function getDistinctMealMonths(dates: Date[]) {
  const months = new Map<string, { year: string; month: string }>();

  for (const date of dates) {
    if (!Number.isFinite(date.getTime())) continue;
    const year = format(date, "yyyy");
    const month = format(date, "MM");
    months.set(`${year}-${month}`, { year, month });
  }

  return [...months.values()];
}
