"use client";

import { useMemo, useState } from "react";
import {
  addMonths,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  isToday,
  startOfMonth,
  startOfWeek,
  subMonths,
} from "date-fns";
import { ko } from "date-fns/locale";
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  ExternalLink,
} from "lucide-react";

import { CalendarInfoTooltip } from "./calendar-info-tooltip";

interface ScheduleItem {
  id: string;
  title: string;
  description?: string | null;
  startDate: Date;
  endDate: Date;
  category?: string;
  isExternal?: boolean;
  isNEIS?: boolean;
}

function getEventPalette(schedule: ScheduleItem) {
  if (schedule.isExternal) {
    return {
      cellBg: "var(--surface)",
      cardBg: "var(--surface)",
      cardBorder: "var(--border)",
      text: "var(--muted)",
      dot: "var(--muted)",
    };
  }

  return {
    cellBg: "var(--surface-2)",
    cardBg: "var(--surface-2)",
    cardBorder: "var(--accent)",
    text: "var(--foreground)",
    dot: "var(--accent)",
  };
}

function getDaySchedules(schedules: ScheduleItem[], day: Date) {
  return schedules
    .filter((schedule) => {
      const startDate = new Date(schedule.startDate);
      const endDate = new Date(schedule.endDate);
      return isSameDay(startDate, day) || (startDate <= day && endDate >= day);
    })
    .sort((left, right) => {
      const leftPriority = left.isExternal ? 1 : 0;
      const rightPriority = right.isExternal ? 1 : 0;
      return leftPriority - rightPriority;
    });
}

export function CalendarView({
  schedules,
  initialDateIso,
}: {
  schedules: ScheduleItem[];
  initialDateIso: string;
}) {
  const initialDate = useMemo(() => new Date(initialDateIso), [initialDateIso]);
  const [currentDate, setCurrentDate] = useState(() => new Date(initialDate));
  const [selectedDate, setSelectedDate] = useState(() => new Date(initialDate));

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);
  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });
  const selectedDaySchedules = getDaySchedules(schedules, selectedDate);

  return (
    <div className="flex flex-col gap-6 2xl:min-h-[calc(100vh-12rem)] 2xl:flex-row 2xl:gap-8">
      <div className="glass flex flex-1 flex-col rounded-3xl p-4 sm:p-6">
        <div className="mb-6 flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <h2 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
                {format(currentDate, "yyyy년 M월")}
              </h2>
              <CalendarInfoTooltip />
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={() => {
                  const today = new Date(initialDate);
                  setCurrentDate(today);
                  setSelectedDate(today);
                }}
                className="mr-2 rounded-xl px-3 py-2 text-xs font-bold transition-colors"
                style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}
              >
                오늘
              </button>
              <button
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
                className="rounded-full p-2 transition-colors"
                style={{ backgroundColor: "var(--surface-2)", color: "var(--foreground)" }}
                aria-label="이전 달"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
                className="rounded-full p-2 transition-colors"
                style={{ backgroundColor: "var(--surface-2)", color: "var(--foreground)" }}
                aria-label="다음 달"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            </div>
          </div>

          <div className="flex items-center gap-1 text-xs" style={{ color: "var(--muted)" }}>
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
            학교 일정
            <span className="mx-2">/</span>
            <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: "var(--muted)" }} />
            외부 일정
          </div>
        </div>

        <div className="mb-2 grid grid-cols-7 text-center text-xs font-bold" style={{ color: "var(--muted)" }}>
          <div>일</div>
          <div>월</div>
          <div>화</div>
          <div>수</div>
          <div>목</div>
          <div>금</div>
          <div>토</div>
        </div>

        <div className="grid grid-cols-7 gap-1.5 auto-rows-[minmax(92px,auto)] sm:auto-rows-[minmax(104px,auto)] xl:auto-rows-[minmax(116px,auto)] 2xl:auto-rows-fr">
          {calendarDays.map((day) => {
            const daySchedules = getDaySchedules(schedules, day);

            return (
              <button
                key={day.toISOString()}
                type="button"
                onClick={() => setSelectedDate(day)}
                className={`relative flex min-h-[92px] flex-col rounded-xl border p-1.5 text-left transition-all sm:min-h-[104px] sm:p-2 xl:min-h-[116px] ${
                  isSameDay(day, selectedDate) ? "ring-2 ring-[color:var(--accent)]" : ""
                }`}
                style={{
                  backgroundColor: isSameMonth(day, monthStart) ? "var(--surface)" : "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: isSameMonth(day, monthStart) ? "var(--foreground)" : "var(--muted)",
                }}
              >
                <div
                  className="mx-auto mb-1 flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold"
                  style={
                    isToday(day)
                      ? { backgroundColor: "var(--accent)", color: "var(--brand-sub)" }
                      : undefined
                  }
                >
                  {format(day, "d")}
                </div>

                <div className="flex w-full flex-1 flex-col gap-1">
                  {daySchedules.slice(0, 2).map((schedule) => (
                    <div
                      key={schedule.id}
                      className="line-clamp-2 rounded-md px-1.5 py-1 text-[10px] font-medium leading-tight xl:text-[11px]"
                      style={{
                        backgroundColor: getEventPalette(schedule).cellBg,
                        color: getEventPalette(schedule).text,
                      }}
                    >
                      {schedule.title}
                    </div>
                  ))}

                  {daySchedules.length > 2 ? (
                    <div className="px-1 text-[9px] font-medium xl:text-[10px]" style={{ color: "var(--muted)" }}>
                      +{daySchedules.length - 2}건 더 보기
                    </div>
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div className="glass h-fit rounded-3xl p-6 2xl:w-80">
        <h3 className="mb-4 flex items-center gap-2 text-lg font-bold" style={{ color: "var(--foreground)" }}>
          <CalendarIcon className="h-5 w-5" style={{ color: "var(--accent)" }} />
          {format(selectedDate, "M월 d일 (EEE)", { locale: ko })}
        </h3>

        <div className="space-y-3">
          {selectedDaySchedules.length > 0 ? (
            selectedDaySchedules.map((schedule) => (
              <div
                key={schedule.id}
                className="rounded-2xl border-l-4 p-4"
                style={{
                  backgroundColor: getEventPalette(schedule).cardBg,
                  borderColor: getEventPalette(schedule).cardBorder,
                }}
              >
                <div className="flex items-center gap-2 text-sm font-bold" style={{ color: "var(--foreground)" }}>
                  {schedule.isExternal ? (
                    <ExternalLink className="h-3 w-3" style={{ color: "var(--muted)" }} />
                  ) : null}
                  {schedule.title}
                </div>
                <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  {schedule.isNEIS
                    ? "NEIS 학사일정"
                    : schedule.isExternal
                      ? "외부 일정 (Google)"
                      : schedule.category}
                </div>
                {schedule.description ? (
                  <div className="mt-2 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                    {schedule.description}
                  </div>
                ) : null}
              </div>
            ))
          ) : (
            <div className="py-12 text-center text-sm" style={{ color: "var(--muted)" }}>
              일정이 없습니다.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
