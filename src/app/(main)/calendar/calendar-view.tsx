"use client";

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
import { Calendar as CalendarIcon, ChevronLeft, ChevronRight, ExternalLink } from "lucide-react";
import { useState } from "react";
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

const weekLabels = ["일", "월", "화", "수", "목", "금", "토"];

export function CalendarView({ schedules }: { schedules: ScheduleItem[] }) {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState(new Date());

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(monthStart);
  const startDate = startOfWeek(monthStart);
  const endDate = endOfWeek(monthEnd);

  const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

  const getDayEvents = (day: Date) =>
    schedules
      .filter((schedule) => {
        const start = new Date(schedule.startDate);
        const end = new Date(schedule.endDate);
        return isSameDay(start, day) || (start <= day && end >= day);
      })
      .sort((a, b) => Number(Boolean(a.isExternal)) - Number(Boolean(b.isExternal)));

  const dailySchedules = getDayEvents(selectedDate);

  const getEventStyle = (schedule: ScheduleItem) => {
    if (schedule.isExternal) {
      return {
        chip: "color-mix(in srgb, var(--surface-3) 86%, transparent)",
        cardBorder: "color-mix(in srgb, var(--border) 72%, transparent)",
        cardBg: "color-mix(in srgb, var(--surface-2) 80%, transparent)",
        dot: "var(--muted)",
        text: "var(--muted)",
      };
    }

    return {
      chip: "color-mix(in srgb, var(--accent) 14%, var(--surface-2) 86%)",
      cardBorder: "color-mix(in srgb, var(--accent) 34%, transparent)",
      cardBg: "color-mix(in srgb, var(--surface) 80%, transparent)",
      dot: "var(--accent)",
      text: "var(--foreground)",
    };
  };

  return (
    <div className="space-y-4 md:space-y-5">
      <section className="glass-strong px-5 py-5 md:px-6 md:py-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
          <div className="space-y-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="info-chip">학교 일정과 외부 일정 함께 보기</span>
              <span className="info-chip">월 단위 일정 탐색</span>
            </div>

            <div>
              <div className="section-kicker">Schedule Calendar</div>
              <div className="mt-1 flex items-center gap-2">
                <h1 className="section-title">학사일정</h1>
                <CalendarInfoTooltip />
              </div>
              <p className="section-copy mt-3">
                학사 일정과 가져온 외부 일정을 한 달 기준으로 함께 확인할 수 있습니다.
              </p>
            </div>
          </div>

          <div
            className="flex flex-wrap items-center gap-2 rounded-[1.4rem] border p-2"
            style={{
              backgroundColor: "color-mix(in srgb, var(--surface-2) 82%, transparent)",
              borderColor: "color-mix(in srgb, var(--border) 72%, transparent)",
            }}
          >
            <button type="button" onClick={() => setCurrentDate(subMonths(currentDate, 1))} className="btn-glass h-10 w-10 px-0 py-0">
              <ChevronLeft className="h-4 w-4" />
            </button>
            <button type="button" onClick={() => { const today = new Date(); setCurrentDate(today); setSelectedDate(today); }} className="btn-glass px-4 py-2 text-xs">
              오늘
            </button>
            <button type="button" onClick={() => setCurrentDate(addMonths(currentDate, 1))} className="btn-glass h-10 w-10 px-0 py-0">
              <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
        <div className="glass-card p-4 md:p-5">
          <div className="mb-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="section-kicker">Monthly View</div>
              <h2 className="mt-1 text-[1.35rem] font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
                {format(currentDate, "yyyy년 M월")}
              </h2>
            </div>

            <div className="flex flex-wrap items-center gap-3 text-xs" style={{ color: "var(--muted)" }}>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--accent)" }} />
                학교 일정
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ backgroundColor: "var(--muted)" }} />
                외부 일정
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-2 pb-2 text-center text-[11px] font-semibold" style={{ color: "var(--muted)" }}>
            {weekLabels.map((label) => (
              <div key={label}>{label}</div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-2">
            {calendarDays.map((day) => {
              const dayEvents = getDayEvents(day);
              const isSelected = isSameDay(day, selectedDate);

              return (
                <button
                  key={day.toISOString()}
                  type="button"
                  onClick={() => setSelectedDate(day)}
                  className="relative flex min-h-[96px] flex-col items-start rounded-[1.15rem] border p-2 text-left transition-all"
                  style={{
                    color: isSameMonth(day, monthStart) ? "var(--foreground)" : "var(--muted)",
                    backgroundColor: isSelected
                      ? "color-mix(in srgb, var(--accent) 10%, var(--surface-2) 90%)"
                      : isSameMonth(day, monthStart)
                        ? "color-mix(in srgb, var(--surface) 76%, transparent)"
                        : "color-mix(in srgb, var(--surface-2) 68%, transparent)",
                    borderColor: isSelected
                      ? "color-mix(in srgb, var(--accent) 42%, transparent)"
                      : "color-mix(in srgb, var(--border) 70%, transparent)",
                    boxShadow: isSelected
                      ? "0 0 0 2px color-mix(in srgb, var(--accent) 16%, transparent)"
                      : "none",
                  }}
                >
                  <span
                    className="mb-2 inline-flex h-7 w-7 items-center justify-center rounded-full text-sm font-semibold"
                    style={isToday(day) ? { backgroundColor: "var(--accent)", color: "#04111e" } : undefined}
                  >
                    {format(day, "d")}
                  </span>

                  <div className="flex w-full flex-col gap-1 overflow-hidden">
                    {dayEvents.slice(0, 2).map((event) => (
                      <span
                        key={event.id}
                        className="truncate rounded-md px-2 py-1 text-[10px] font-medium"
                        style={{
                          backgroundColor: getEventStyle(event).chip,
                          color: event.isExternal ? "var(--muted)" : "var(--foreground)",
                        }}
                      >
                        {event.title}
                      </span>
                    ))}
                    {dayEvents.length > 2 ? (
                      <span className="px-1 text-[10px]" style={{ color: "var(--muted)" }}>
                        +{dayEvents.length - 2}개 더 있음
                      </span>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <aside className="glass-card h-fit p-5 md:p-6">
          <div className="section-kicker">Daily Details</div>
          <h2 className="mt-2 flex items-center gap-2 text-[1.15rem] font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
            <CalendarIcon className="h-4 w-4" style={{ color: "var(--accent)" }} />
            {format(selectedDate, "M월 d일 (EEE)", { locale: ko })}
          </h2>

          <div className="mt-4 space-y-3">
            {dailySchedules.length > 0 ? (
              dailySchedules.map((schedule) => {
                const tone = getEventStyle(schedule);

                return (
                  <div
                    key={schedule.id}
                    className="rounded-[1.2rem] border p-4"
                    style={{
                      borderColor: tone.cardBorder,
                      backgroundColor: tone.cardBg,
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                          <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tone.dot }} />
                          <span className="line-clamp-2">{schedule.title}</span>
                          {schedule.isExternal ? <ExternalLink className="h-3.5 w-3.5 shrink-0" style={{ color: "var(--muted)" }} /> : null}
                        </div>
                        <div className="mt-2 text-xs" style={{ color: tone.text }}>
                          {schedule.isNEIS ? "NEIS 학사일정" : schedule.isExternal ? "외부 일정" : schedule.category || "학교 일정"}
                        </div>
                      </div>
                    </div>

                    {schedule.description ? (
                      <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                        {schedule.description}
                      </p>
                    ) : null}
                  </div>
                );
              })
            ) : (
              <div
                className="rounded-[1.2rem] border px-4 py-8 text-center text-sm"
                style={{
                  borderColor: "color-mix(in srgb, var(--border) 72%, transparent)",
                  color: "var(--muted)",
                }}
              >
                선택한 날짜에는 일정이 없습니다.
              </div>
            )}
          </div>
        </aside>
      </section>
    </div>
  );
}
