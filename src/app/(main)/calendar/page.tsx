import { prisma } from "@/lib/db";
import { CalendarView } from "./calendar-view";
import { getICalUrl } from "../admin/settings/actions";
import { getEventsFromICal } from "@/lib/google-calendar";
import { getSchoolSchedule } from "@/lib/neis";
import { format, startOfMonth, endOfMonth } from "date-fns";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "학사일정",
  description: "경남과학고등학교의 주요 학사일정과 행사 정보를 확인하세요.",
};

export default async function CalendarPage() {
  const dbSchedulesPromise = prisma.schedule.findMany();
  const iCalUrl = await getICalUrl();
  const iCalEventsPromise = getEventsFromICal(iCalUrl || "");

  // Fetch NEIS schedules for current ACADEMIC YEAR (March 1st ~ Next Feb end)
  const now = new Date();
  const currentMonth = now.getMonth() + 1; // 1~12
  const currentYear = now.getFullYear();

  // 학사년도 시작 연도 계산 (3월 기준)
  // 1, 2월이면 작년 3월부터 시작한 학기임.
  const academicStartYear = currentMonth >= 3 ? currentYear : currentYear - 1;
  const fromDate = `${academicStartYear}0301`;

  // 학사년도 종료: 다음해 2월 말일
  // 윤년 계산 필요하지만, 2월 29일을 포함하려면 그냥 2월 29일로 해도 API가 알아서 처리하거나 28일로 끊어도 됨.
  // 안전하게 다음 해 3월 1일 전날... 보다는 그냥 마지막날 string 생성.
  // new Date(y, m, 0)
  const nextFebLastDay = new Date(academicStartYear + 1, 2, 0).getDate(); // 3월(idx 2)의 0일 = 2월 말일
  const toDate = `${academicStartYear + 1}02${nextFebLastDay}`;

  const neisSchedulesPromise = getSchoolSchedule(fromDate, toDate);

  const [dbSchedules, iCalEvents, neisSchedules] = await Promise.all([
    dbSchedulesPromise,
    iCalEventsPromise,
    neisSchedulesPromise
  ]);

  // Transform NEIS schedules to match ScheduleItem format
  const neisEvents = neisSchedules.map(neis => ({
    id: `neis-${neis.AA_YMD}-${neis.EVENT_NM}`,
    title: neis.EVENT_NM,
    description: neis.EVENT_CNTNT || neis.SBTR_DD_SC_NM,
    startDate: new Date(
      parseInt(neis.AA_YMD.substring(0, 4)),
      parseInt(neis.AA_YMD.substring(4, 6)) - 1,
      parseInt(neis.AA_YMD.substring(6, 8))
    ),
    endDate: new Date(
      parseInt(neis.AA_YMD.substring(0, 4)),
      parseInt(neis.AA_YMD.substring(4, 6)) - 1,
      parseInt(neis.AA_YMD.substring(6, 8))
    ),
    category: "ACADEMIC",
    isNEIS: true,
  }));

  const allSchedules = [...dbSchedules, ...iCalEvents, ...neisEvents];

  return (
    <div className="p-4 md:p-8">
      <CalendarView schedules={allSchedules} />
    </div>
  );
}
