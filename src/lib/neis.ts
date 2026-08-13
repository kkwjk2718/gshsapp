import { cancelResponseBody, formatOutboundError, readBoundedJsonResponse } from "@/lib/outbound-response";

const NEIS_API_KEY = process.env.NEXT_PUBLIC_NEIS_API_KEY;
const OFFICE_CODE = "S10";
const SCHOOL_CODE = "9010033";
const BASE_URL = "https://open.neis.go.kr/hub";
const NEIS_TIMEOUT_MS = 8_000;
const NEIS_MAX_RESPONSE_BYTES = 1_000_000;

export interface MealInfo {
  MMEAL_SC_CODE: string;
  MMEAL_SC_NM: string;
  DDISH_NM: string;
  CAL_INFO: string;
  NTR_INFO: string;
  MLSV_YMD: string;
}

export interface TimetableInfo {
  PERIO: string;
  ITRT_CNTNT: string;
}

export interface SchoolScheduleInfo {
  AY: string;
  AA_YMD: string;
  EVENT_NM: string;
  EVENT_CNTNT: string;
  SBTR_DD_SC_NM?: string;
}

export const ALLERGY_MAP: Record<string, string> = {
  "1": "난류",
  "2": "우유",
  "3": "메밀",
  "4": "땅콩",
  "5": "대두",
  "6": "밀",
  "7": "고등어",
  "8": "게",
  "9": "새우",
  "10": "돼지고기",
  "11": "복숭아",
  "12": "토마토",
  "13": "아황산염",
  "14": "호두",
  "15": "닭고기",
  "16": "쇠고기",
  "17": "오징어",
  "18": "조개류(굴,전복,홍합 등)",
  "19": "잣",
};

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function boundedString(value: unknown, maxLength: number, required = true): string | null {
  if (typeof value !== "string") return required ? null : "";
  const normalized = value.trim();
  if (required && !normalized) return null;
  return normalized.slice(0, maxLength);
}

function isRealDateKey(value: string) {
  if (!/^\d{8}$/.test(value)) return false;
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(4, 6));
  const day = Number(value.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

function isDateInServiceWindow(value: string, now = new Date()) {
  if (!isRealDateKey(value)) return false;
  const year = Number(value.slice(0, 4));
  const currentYear = now.getUTCFullYear();
  return year >= currentYear - 1 && year <= currentYear + 1;
}

function isPositiveIntegerInRange(value: string, max: number) {
  return /^(?:[1-9]|1\d|20)$/.test(value) && Number(value) <= max;
}

function extractRows(payload: unknown, sectionName: string): unknown[] {
  if (!isObject(payload)) return [];
  const section = payload[sectionName];
  if (!Array.isArray(section) || section.length > 4) return [];
  const rowContainer = section.find((entry) => isObject(entry) && Array.isArray(entry.row));
  return rowContainer && isObject(rowContainer) && Array.isArray(rowContainer.row) ? rowContainer.row : [];
}

async function fetchNeisRows(
  endpoint: string,
  params: URLSearchParams,
  sectionName: string,
  revalidate: number,
) {
  const response = await fetch(`${BASE_URL}/${endpoint}?${params.toString()}`, {
    next: { revalidate },
    headers: { Accept: "application/json" },
    signal: AbortSignal.timeout(NEIS_TIMEOUT_MS),
  });

  if (!response.ok) {
    await cancelResponseBody(response, "NEIS request failed");
    throw new Error(`NEIS request failed with status ${response.status}`);
  }
  const payload = await readBoundedJsonResponse(response, { maxBytes: NEIS_MAX_RESPONSE_BYTES });
  return extractRows(payload, sectionName);
}

function baseParams(pageSize: number) {
  return new URLSearchParams({
    KEY: NEIS_API_KEY || "",
    Type: "json",
    pIndex: "1",
    pSize: String(pageSize),
    ATPT_OFCDC_SC_CODE: OFFICE_CODE,
    SD_SCHUL_CODE: SCHOOL_CODE,
  });
}

function parseMeal(row: unknown): MealInfo | null {
  if (!isObject(row)) return null;
  const MMEAL_SC_CODE = boundedString(row.MMEAL_SC_CODE, 4);
  const MMEAL_SC_NM = boundedString(row.MMEAL_SC_NM, 20);
  const DDISH_NM = boundedString(row.DDISH_NM, 4_000);
  const CAL_INFO = boundedString(row.CAL_INFO, 100, false);
  const NTR_INFO = boundedString(row.NTR_INFO, 4_000, false);
  const MLSV_YMD = boundedString(row.MLSV_YMD, 8);
  if (!MMEAL_SC_CODE || !/^[1-3]$/.test(MMEAL_SC_CODE) || !MMEAL_SC_NM || !DDISH_NM || !MLSV_YMD || !isRealDateKey(MLSV_YMD)) return null;
  return { MMEAL_SC_CODE, MMEAL_SC_NM, DDISH_NM, CAL_INFO: CAL_INFO || "", NTR_INFO: NTR_INFO || "", MLSV_YMD };
}

function parseTimetable(row: unknown): TimetableInfo | null {
  if (!isObject(row)) return null;
  const PERIO = boundedString(row.PERIO, 2);
  const ITRT_CNTNT = boundedString(row.ITRT_CNTNT, 200);
  if (!PERIO || !isPositiveIntegerInRange(PERIO, 20) || !ITRT_CNTNT) return null;
  return { PERIO, ITRT_CNTNT };
}

function parseSchedule(row: unknown): SchoolScheduleInfo | null {
  if (!isObject(row)) return null;
  const AY = boundedString(row.AY, 4);
  const AA_YMD = boundedString(row.AA_YMD, 8);
  const EVENT_NM = boundedString(row.EVENT_NM, 200);
  const EVENT_CNTNT = boundedString(row.EVENT_CNTNT, 2_000, false);
  const SBTR_DD_SC_NM = boundedString(row.SBTR_DD_SC_NM, 100, false);
  if (!AY || !/^\d{4}$/.test(AY) || !AA_YMD || !isRealDateKey(AA_YMD) || !EVENT_NM) return null;
  const eventYear = Number(AA_YMD.slice(0, 4));
  const eventMonth = Number(AA_YMD.slice(4, 6));
  const academicYear = Number(AY);
  if (academicYear !== eventYear && !(eventMonth <= 2 && academicYear === eventYear - 1)) return null;
  return {
    AY,
    AA_YMD,
    EVENT_NM,
    EVENT_CNTNT: EVENT_CNTNT || "",
    ...(SBTR_DD_SC_NM ? { SBTR_DD_SC_NM } : {}),
  };
}

export async function getMeals(date: string): Promise<MealInfo[]> {
  if (!isDateInServiceWindow(date)) return [];
  try {
    const params = baseParams(10);
    params.set("MLSV_YMD", date);
    const rows = await fetchNeisRows("mealServiceDietInfo", params, "mealServiceDietInfo", 3_600);
    return rows
      .slice(0, 100)
      .map(parseMeal)
      .filter((row): row is MealInfo => Boolean(row && row.MLSV_YMD === date))
      .slice(0, 10);
  } catch (error) {
    console.error("Failed to fetch meals:", formatOutboundError(error));
    return [];
  }
}

export async function getTimetable(date: string, grade: string, classNum: string): Promise<TimetableInfo[]> {
  if (!isDateInServiceWindow(date) || !/^[1-3]$/.test(grade) || !isPositiveIntegerInRange(classNum, 20)) return [];
  try {
    const params = baseParams(20);
    params.set("ALL_TI_YMD", date);
    params.set("GRADE", grade);
    params.set("CLASS_NM", classNum);
    const rows = await fetchNeisRows("hisTimetable", params, "hisTimetable", 3_600);
    return rows
      .slice(0, 100)
      .map(parseTimetable)
      .filter((row): row is TimetableInfo => Boolean(row))
      .slice(0, 20);
  } catch (error) {
    console.error("Failed to fetch timetable:", formatOutboundError(error));
    return [];
  }
}

export async function getSchoolSchedule(fromDate: string, toDate: string): Promise<SchoolScheduleInfo[]> {
  if (!isDateInServiceWindow(fromDate) || !isDateInServiceWindow(toDate) || fromDate > toDate) return [];
  const spanMs = Date.UTC(Number(toDate.slice(0, 4)), Number(toDate.slice(4, 6)) - 1, Number(toDate.slice(6, 8))) -
    Date.UTC(Number(fromDate.slice(0, 4)), Number(fromDate.slice(4, 6)) - 1, Number(fromDate.slice(6, 8)));
  if (spanMs > 1_100 * 86_400_000) return [];

  try {
    const params = baseParams(500);
    params.set("AA_FROM_YMD", fromDate);
    params.set("AA_TO_YMD", toDate);
    const rows = await fetchNeisRows("SchoolSchedule", params, "SchoolSchedule", 86_400);
    return rows
      .slice(0, 500)
      .map(parseSchedule)
      .filter((row): row is SchoolScheduleInfo => Boolean(row && row.AA_YMD >= fromDate && row.AA_YMD <= toDate));
  } catch (error) {
    console.error("Failed to fetch school schedule:", formatOutboundError(error));
    return [];
  }
}

export async function getMonthlyMeals(year: string, month: string): Promise<MealInfo[]> {
  const currentYear = new Date().getUTCFullYear();
  if (!/^\d{4}$/.test(year) || !/^(0[1-9]|1[0-2])$/.test(month)) return [];
  const numericYear = Number(year);
  if (numericYear < currentYear - 1 || numericYear > currentYear + 1) return [];

  const lastDay = new Date(Date.UTC(numericYear, Number(month), 0)).getUTCDate();
  const fromDate = `${year}${month}01`;
  const toDate = `${year}${month}${String(lastDay).padStart(2, "0")}`;

  try {
    const params = baseParams(100);
    params.set("MLSV_FROM_YMD", fromDate);
    params.set("MLSV_TO_YMD", toDate);
    const rows = await fetchNeisRows("mealServiceDietInfo", params, "mealServiceDietInfo", 3_600);
    return rows
      .slice(0, 100)
      .map(parseMeal)
      .filter((row): row is MealInfo => Boolean(row && row.MLSV_YMD >= fromDate && row.MLSV_YMD <= toDate));
  } catch (error) {
    console.error("Failed to fetch monthly meals:", formatOutboundError(error));
    return [];
  }
}
