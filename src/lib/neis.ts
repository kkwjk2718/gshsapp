const NEIS_API_KEY = process.env.NEXT_PUBLIC_NEIS_API_KEY;
const OFFICE_CODE = "S10";
const SCHOOL_CODE = "9010033";
const BASE_URL = "https://open.neis.go.kr/hub";

export interface MealInfo {
  MMEAL_SC_CODE: string; // 1: 조식, 2: 중식, 3: 석식
  MMEAL_SC_NM: string;
  DDISH_NM: string; // 급식 내용 (HTML tags included)
  CAL_INFO: string;
  NTR_INFO: string;
}

export interface TimetableInfo {
  PERIO: string; // 교시
  ITRT_CNTNT: string; // 과목명
}

// NEIS 알레르기 코드 매핑
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

export const getMeals = async (date: string): Promise<MealInfo[]> => {
  // date format: YYYYMMDD
  try {
    const params = new URLSearchParams({
      KEY: NEIS_API_KEY || "",
      Type: 'json',
      pIndex: '1',
      pSize: '10',
      ATPT_OFCDC_SC_CODE: OFFICE_CODE,
      SD_SCHUL_CODE: SCHOOL_CODE,
      MLSV_YMD: date,
    });

    // Next.js fetch with caching (revalidate every 1 hour)
    const response = await fetch(`${BASE_URL}/mealServiceDietInfo?${params.toString()}`, {
      next: { revalidate: 3600 },
    });

    if (!response.ok) throw new Error("Network response was not ok");

    const data = await response.json();

    if (data.mealServiceDietInfo) {
      return data.mealServiceDietInfo[1].row as MealInfo[];
    }
    return [];
  } catch (error) {
    console.error("Failed to fetch meals:", error);
    return [];
  }
};

export const getTimetable = async (date: string, grade: string, classNum: string): Promise<TimetableInfo[]> => {
  // date format: YYYYMMDD
  try {
    const params = new URLSearchParams({
      KEY: NEIS_API_KEY || "",
      Type: 'json',
      pIndex: '1',
      pSize: '100',
      ATPT_OFCDC_SC_CODE: OFFICE_CODE,
      SD_SCHUL_CODE: SCHOOL_CODE,
      ALL_TI_YMD: date,
      GRADE: grade,
      CLASS_NM: classNum,
    });

    const response = await fetch(`${BASE_URL}/hisTimetable?${params.toString()}`, {
      next: { revalidate: 3600 },
    });

    if (!response.ok) throw new Error("Network response was not ok");

    const data = await response.json();

    if (data.hisTimetable) {
      return data.hisTimetable[1].row as TimetableInfo[];
    }
    return [];
  } catch (error) {
    console.error("Failed to fetch timetable:", error);
    return [];
  }
};

export interface SchoolScheduleInfo {
  AY: string; // 학년도
  AA_YMD: string; // 학사일자 (YYYYMMDD)
  EVENT_NM: string; // 행사명
  EVENT_CNTNT: string; // 행사내용
  SBTR_DD_SC_NM?: string; // 수업공제일명
}

export const getSchoolSchedule = async (fromDate: string, toDate: string): Promise<SchoolScheduleInfo[]> => {
  // date format: YYYYMMDD
  try {
    const params = new URLSearchParams({
      KEY: NEIS_API_KEY || "",
      Type: 'json',
      pIndex: '1',
      pSize: '100',
      ATPT_OFCDC_SC_CODE: OFFICE_CODE,
      SD_SCHUL_CODE: SCHOOL_CODE,
      AA_FROM_YMD: fromDate,
      AA_TO_YMD: toDate,
    });

    const response = await fetch(`${BASE_URL}/SchoolSchedule?${params.toString()}`, {
      next: { revalidate: 3600 }, // Cache for 1 hour
    });

    if (!response.ok) throw new Error("Network response was not ok");

    const data = await response.json();

    if (data.SchoolSchedule) {
      return data.SchoolSchedule[1].row as SchoolScheduleInfo[];
    }
    return [];
  } catch (error) {
    console.error("Failed to fetch school schedule:", error);
    return [];
  }
};