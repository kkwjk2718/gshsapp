export interface PublicCalendarSchedule {
  id: string;
  title: string;
  description: string | null;
  startDate: string;
  endDate: string;
  category: string;
}

interface CalendarScheduleInput {
  id: unknown;
  title: unknown;
  description?: unknown;
  startDate: unknown;
  endDate: unknown;
  category: unknown;
}

function boundedRequiredText(value: unknown, maxLength: number) {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maxLength) : null;
}

export function toPublicCalendarSchedule(input: CalendarScheduleInput): PublicCalendarSchedule | null {
  const id = boundedRequiredText(input.id, 256);
  const title = boundedRequiredText(input.title, 200);
  const category = boundedRequiredText(input.category, 32);
  const description = typeof input.description === "string"
    ? input.description.trim().slice(0, 2_000) || null
    : null;
  const startDate = new Date(input.startDate as Date | string | number);
  const endDate = new Date(input.endDate as Date | string | number);

  if (!id || !title || !category || !Number.isFinite(startDate.getTime()) || !Number.isFinite(endDate.getTime())) {
    return null;
  }
  if (endDate < startDate || endDate.getTime() - startDate.getTime() > 366 * 86_400_000) return null;

  return {
    id,
    title,
    description,
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
    category,
  };
}
