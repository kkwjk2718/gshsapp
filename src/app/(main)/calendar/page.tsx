import type { Metadata } from "next";
import { getCalendarSchedules } from "@/lib/public-content";
import { CalendarView } from "./calendar-view";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "학사일정",
  description: "경남과학고의 주요 학사일정과 외부 캘린더 일정을 함께 확인하세요.",
};

export default async function CalendarPage() {
  const allSchedules = await getCalendarSchedules();

  return (
    <div className="page-shell">
      <div className="page-shell-narrow">
        <CalendarView schedules={allSchedules} />
      </div>
    </div>
  );
}
