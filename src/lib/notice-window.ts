import type { Prisma } from "@prisma/client";
import { addDays, differenceInCalendarDays, subDays } from "date-fns";
import { formatInTimeZone, fromZonedTime, toZonedTime } from "date-fns-tz";

const SEOUL_TZ = "Asia/Seoul";
const DATE_INPUT_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const DEFAULT_NOTICE_DURATION_DAYS = 7;
const MIN_NOTICE_DURATION_DAYS = 1;
const MAX_NOTICE_DURATION_DAYS = 14;

type DateLike = Date | string | null | undefined;

type NoticeWindow = {
  startsAt: DateLike;
  expiresAt: DateLike;
};

type BuildNoticeWindowInput = {
  unlimited: boolean;
  detailedPeriod?: boolean;
  duration?: FormDataEntryValue | null;
  startDate: FormDataEntryValue | null;
  endDate: FormDataEntryValue | null;
  now?: Date;
};

function isDateInput(value: string) {
  return DATE_INPUT_PATTERN.test(value);
}

function parseDateInputParts(value: string) {
  const [year, month, day] = value.split("-").map((part) => Number.parseInt(part, 10));
  return { year, month, day };
}

function addDaysToDateInput(value: string, amount: number) {
  const { year, month, day } = parseDateInputParts(value);
  const shifted = addDays(new Date(Date.UTC(year, month - 1, day)), amount);
  return formatInTimeZone(shifted, "UTC", "yyyy-MM-dd");
}

function toDate(value: DateLike) {
  if (!value) {
    return null;
  }

  return value instanceof Date ? value : new Date(value);
}

function clampNoticeDurationDays(value: number) {
  return Math.min(Math.max(value, MIN_NOTICE_DURATION_DAYS), MAX_NOTICE_DURATION_DAYS);
}

function parseNoticeDurationDays(value: FormDataEntryValue | null | undefined) {
  if (typeof value !== "string") {
    return DEFAULT_NOTICE_DURATION_DAYS;
  }

  const parsed = Number.parseInt(value, 10);

  if (!Number.isFinite(parsed)) {
    return DEFAULT_NOTICE_DURATION_DAYS;
  }

  return clampNoticeDurationDays(parsed);
}

function formatNoticeDurationLabel(durationDays: number) {
  return `작성 시점부터 ${durationDays}일 동안 공지가 노출됩니다.`;
}

export function getDetailedNoticeDateRangeFromDuration(duration: string, now: Date = new Date()) {
  const startDate = getTodayNoticeDateInputValue(now);
  const durationDays = parseNoticeDurationDays(duration);

  return {
    startDate,
    endDate: addDaysToDateInput(startDate, durationDays - 1),
  };
}

export function getTodayNoticeDateInputValue(now: Date = new Date()) {
  return formatInTimeZone(now, SEOUL_TZ, "yyyy-MM-dd");
}

export function buildNoticeWindow({
  unlimited,
  detailedPeriod = true,
  duration,
  startDate,
  endDate,
  now = new Date(),
}: BuildNoticeWindowInput) {
  if (unlimited) {
    return { startsAt: null, expiresAt: null };
  }

  if (!detailedPeriod) {
    return {
      startsAt: null,
      expiresAt: addDays(now, parseNoticeDurationDays(duration)),
    };
  }

  if (typeof startDate !== "string" || typeof endDate !== "string" || !isDateInput(startDate) || !isDateInput(endDate)) {
    throw new Error("공지 기간을 올바르게 선택해 주세요.");
  }

  if (endDate < startDate) {
    throw new Error("공지 종료일은 시작일보다 빠를 수 없습니다.");
  }

  return {
    startsAt: fromZonedTime(`${startDate}T19:00:00`, SEOUL_TZ),
    expiresAt: fromZonedTime(`${addDaysToDateInput(endDate, 1)}T05:00:00`, SEOUL_TZ),
  };
}

export function getNoticeFormDateRange(window: NoticeWindow, now: Date = new Date()) {
  const today = getTodayNoticeDateInputValue(now);
  const startsAt = toDate(window.startsAt);
  const expiresAt = toDate(window.expiresAt);

  if (!expiresAt) {
    return {
      unlimited: true,
      detailedPeriod: false,
      duration: String(DEFAULT_NOTICE_DURATION_DAYS),
      startDate: today,
      endDate: today,
    };
  }

  if (!startsAt) {
    const durationDays = clampNoticeDurationDays(
      differenceInCalendarDays(toZonedTime(expiresAt, SEOUL_TZ), toZonedTime(now, SEOUL_TZ)),
    );

    return {
      unlimited: false,
      detailedPeriod: false,
      duration: String(durationDays),
      startDate: today,
      endDate: formatInTimeZone(expiresAt, SEOUL_TZ, "yyyy-MM-dd"),
    };
  }

  return {
    unlimited: false,
    detailedPeriod: true,
    duration: String(DEFAULT_NOTICE_DURATION_DAYS),
    startDate: formatInTimeZone(startsAt, SEOUL_TZ, "yyyy-MM-dd"),
    endDate: formatInTimeZone(subDays(toZonedTime(expiresAt, SEOUL_TZ), 1), SEOUL_TZ, "yyyy-MM-dd"),
  };
}

export function getNoticeWindowPreview(startDate: string, endDate: string) {
  try {
    const window = buildNoticeWindow({
      unlimited: false,
      detailedPeriod: true,
      startDate,
      endDate,
    });

    return formatNoticeWindowLabel(window);
  } catch {
    return "시작일 19:00 ~ 종료일 다음날 05:00";
  }
}

export function getSimpleNoticeWindowPreview(duration: string) {
  return formatNoticeDurationLabel(parseNoticeDurationDays(duration));
}

export function formatNoticeWindowLabel(window: NoticeWindow) {
  const startsAt = toDate(window.startsAt);
  const expiresAt = toDate(window.expiresAt);

  if (!startsAt && !expiresAt) {
    return "상시 공지";
  }

  if (!startsAt && expiresAt) {
    return `${formatInTimeZone(expiresAt, SEOUL_TZ, "yyyy.MM.dd HH:mm")}까지`;
  }

  if (!startsAt || !expiresAt) {
    return "상시 공지";
  }

  return `${formatInTimeZone(startsAt, SEOUL_TZ, "yyyy.MM.dd HH:mm")} ~ ${formatInTimeZone(expiresAt, SEOUL_TZ, "yyyy.MM.dd HH:mm")}`;
}

export function isNoticeVisibleAt(window: NoticeWindow, now: Date = new Date()) {
  const startsAt = toDate(window.startsAt);
  const expiresAt = toDate(window.expiresAt);

  if (startsAt && startsAt > now) {
    return false;
  }

  if (expiresAt && expiresAt <= now) {
    return false;
  }

  return true;
}

export function getNoticeVisibilityWhere(now: Date = new Date()): Prisma.NoticeWhereInput {
  return {
    AND: [
      {
        OR: [{ startsAt: null }, { startsAt: { lte: now } }],
      },
      {
        OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
      },
    ],
  };
}
