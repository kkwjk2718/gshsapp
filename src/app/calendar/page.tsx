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

  // Fetch NEIS schedules for current month (±1 month for better coverage)
  const now = new Date();
  const fromDate = format(startOfMonth(new Date(now.getFullYear(), now.getMonth() - 1, 1)), "yyyyMMdd");
  const toDate = format(endOfMonth(new Date(now.getFullYear(), now.getMonth() + 1, 1)), "yyyyMMdd");
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
