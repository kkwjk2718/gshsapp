import { CalendarView } from "./calendar-view";
import { getCalendarSchedules } from "@/lib/public-content";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "학사일정",
  description: "경남과학고등학교의 주요 학사일정과 행사 정보를 확인하세요.",
};

export default async function CalendarPage() {
  const allSchedules = await getCalendarSchedules();

  return (
    <div className="mobile-page mobile-safe-bottom">
      <CalendarView schedules={allSchedules} />
    </div>
  );
}
