"use client"

import { useState } from "react";
import { format, addMonths, subMonths, startOfMonth, endOfMonth, startOfWeek, endOfWeek, eachDayOfInterval, isSameMonth, isSameDay, isToday } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, ExternalLink } from "lucide-react";
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

export function CalendarView({ schedules }: { schedules: ScheduleItem[] }) {
    const [currentDate, setCurrentDate] = useState(new Date());
    const [selectedDate, setSelectedDate] = useState(new Date());

    const monthStart = startOfMonth(currentDate);
    const monthEnd = endOfMonth(monthStart);
    const startDate = startOfWeek(monthStart);
    const endDate = endOfWeek(monthEnd);

    const calendarDays = eachDayOfInterval({ start: startDate, end: endDate });

    const nextMonth = () => setCurrentDate(addMonths(currentDate, 1));
    const prevMonth = () => setCurrentDate(subMonths(currentDate, 1));
    const goToday = () => {
        const today = new Date();
        setCurrentDate(today);
        setSelectedDate(today);
    };

    const dailySchedules = schedules.filter(s =>
        isSameDay(new Date(s.startDate), selectedDate) ||
        (new Date(s.startDate) <= selectedDate && new Date(s.endDate) >= selectedDate)
    ).sort((a, b) => (a.isExternal ? 1 : -1));

    const getEventStyle = (s: ScheduleItem) => {
        if (s.isExternal) return { dot: 'var(--muted)', cardBorder: 'var(--border)', cardBg: 'var(--surface)', cellBg: 'var(--surface)', text: 'var(--muted)' };
        return { dot: 'var(--accent)', cardBorder: 'var(--accent)', cardBg: 'var(--surface-2)', cellBg: 'var(--surface-2)', text: 'var(--foreground)' };
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 lg:h-[calc(100vh-12rem)]">
            {/* Calendar Grid */}
            <div className="flex-1 glass p-4 sm:p-6 rounded-3xl flex flex-col">
                {/* Header */}
                <div className="flex flex-col gap-3 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>{format(currentDate, "yyyy년 M월")}</h2>
                            <CalendarInfoTooltip />
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={goToday} className="px-3 py-2 text-xs font-bold rounded-xl transition-colors mr-2" style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}>오늘</button>
                            <button onClick={prevMonth} className="p-2 rounded-full transition-colors" style={{ backgroundColor: "var(--surface-2)", color: "var(--foreground)" }}><ChevronLeft className="w-5 h-5" /></button>
                            <button onClick={nextMonth} className="p-2 rounded-full transition-colors" style={{ backgroundColor: "var(--surface-2)", color: "var(--foreground)" }}><ChevronRight className="w-5 h-5" /></button>
                        </div>
                    </div>
                    <div className="text-xs flex items-center gap-1" style={{ color: "var(--muted)" }}>
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: "var(--accent)" }}></span>
                        학사일정
                        <span className="mx-2">•</span>
                        <span className="inline-block w-2 h-2 rounded-full" style={{ backgroundColor: "var(--muted)" }}></span>
                        외부 일정
                    </div>
                </div>
                {/* Days of Week */}
                <div className="grid grid-cols-7 text-center text-xs font-bold mb-2" style={{ color: "var(--muted)" }}>
                    <div>일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div>토</div>
                </div>
                {/* Day Cells */}
                <div className="grid grid-cols-7 auto-rows-fr gap-1 flex-1 min-h-0">
                    {calendarDays.map((day, idx) => {
                        const dayEvents = schedules.filter(s => isSameDay(new Date(s.startDate), day) || (new Date(s.startDate) <= day && new Date(s.endDate) >= day));
                        return (
                            <div
                                key={idx}
                                onClick={() => setSelectedDate(day)}
                                className={`relative p-1.5 sm:p-2 rounded-xl cursor-pointer transition-all border flex flex-col items-center overflow-hidden ${isSameDay(day, selectedDate) ? "ring-2 ring-[color:var(--accent)] z-10" : ""}`}
                                style={{
                                  color: isSameMonth(day, monthStart) ? "var(--foreground)" : "var(--muted)",
                                  backgroundColor: isSameMonth(day, monthStart) ? "var(--surface)" : "var(--surface-2)",
                                  borderColor: "var(--border)",
                                }}
                            >
                                <div className={`text-sm font-bold mb-1 flex justify-center items-center w-6 h-6 rounded-full mx-auto`} style={isToday(day) ? { backgroundColor: "var(--accent)", color: "var(--brand-sub)" } : {}}>
                                    {format(day, "d")}
                                </div>
                                <div className="flex flex-col gap-0.5 items-start text-left w-full overflow-hidden px-0.5">
                                    {dayEvents.slice(0, 2).map(evt => (
                                        <p key={evt.id} className="text-[8px] leading-snug px-1 py-0.5 rounded-md w-full font-medium truncate"
                                           style={{ backgroundColor: getEventStyle(evt).cellBg, color: getEventStyle(evt).text }}>
                                            {evt.title}
                                        </p>
                                    ))}
                                    {dayEvents.length > 2 && (
                                        <div className="text-[7px] text-center w-full px-1" style={{ color: "var(--muted)" }}>+{dayEvents.length - 2}개</div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
            {/* Detail Panel */}
            <div className="lg:w-80 glass p-6 rounded-3xl h-fit">
                <h3 className="text-lg font-bold mb-4 flex items-center gap-2">
                    <CalendarIcon className="w-5 h-5" style={{ color: "var(--accent)" }} />
                    {format(selectedDate, "M월 d일 (EEE)", { locale: ko })}
                </h3>
                <div className="space-y-3">
                    {dailySchedules.length > 0 ? dailySchedules.map(schedule => (
                        <div key={schedule.id} className="p-4 rounded-2xl border-l-4" style={{ borderColor: getEventStyle(schedule).cardBorder, backgroundColor: getEventStyle(schedule).cardBg }}>
                            <div className="font-bold text-sm flex items-center gap-2">
                                {schedule.isExternal && <ExternalLink className="w-3 h-3" style={{ color: "var(--muted)" }} />}
                                {schedule.title}
                            </div>
                            <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                                {schedule.isNEIS ? "NEIS 학사일정" : schedule.isExternal ? "외부 일정 (Google)" : schedule.category}
                            </div>
                            {schedule.description && (
                                <div className="text-xs mt-1" style={{ color: "var(--muted)" }}>
                                    {schedule.description}
                                </div>
                            )}
                        </div>
                    )) : (
                        <div className="text-center py-12" style={{ color: "var(--muted)" }}>일정이 없습니다.</div>
                    )}
                </div>
            </div>
        </div>
    )
}
