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
    category?: string; // ACADEMIC, EVENT, HOLIDAY, PERSONAL
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
        if (s.isNEIS) return { dot: 'bg-amber-400', card: 'border-amber-500 bg-amber-50 dark:bg-amber-900/20', cellBg: 'bg-amber-50 dark:bg-amber-900/10' };
        if (s.isExternal) return { dot: 'bg-slate-400', card: 'border-slate-500 bg-slate-50 dark:bg-slate-800/20', cellBg: 'bg-slate-50 dark:bg-slate-800/50' };
        if (s.category === 'HOLIDAY') return { dot: 'bg-rose-400', card: 'border-rose-500 bg-rose-50 dark:bg-rose-900/20', cellBg: 'bg-rose-50 dark:bg-rose-900/10' };
        if (s.category === 'PERSONAL') return { dot: 'bg-emerald-400', card: 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20', cellBg: 'bg-emerald-50 dark:bg-emerald-900/10' };
        return { dot: 'bg-indigo-400', card: 'border-indigo-500 bg-indigo-50 dark:bg-indigo-900/20', cellBg: 'bg-indigo-50 dark:bg-indigo-900/10' };
    };

    return (
        <div className="flex flex-col lg:flex-row gap-6 lg:gap-8 lg:h-[calc(100vh-12rem)]">
            {/* Calendar Grid */}
            <div className="flex-1 glass p-4 sm:p-6 rounded-3xl flex flex-col">
                {/* Header */}
                <div className="flex flex-col gap-3 mb-6">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <h2 className="text-2xl font-bold text-slate-800 dark:text-slate-100">{format(currentDate, "yyyy년 M월")}</h2>
                            <CalendarInfoTooltip />
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={goToday} className="px-3 py-2 text-xs font-bold bg-indigo-100 text-indigo-600 rounded-xl hover:bg-indigo-200 transition-colors mr-2">오늘</button>
                            <button onClick={prevMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><ChevronLeft className="w-5 h-5" /></button>
                            <button onClick={nextMonth} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors"><ChevronRight className="w-5 h-5" /></button>
                        </div>
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
                        <span className="inline-block w-2 h-2 rounded-full bg-amber-400"></span>
                        NEIS 학사일정
                        <span className="mx-2">•</span>
                        <span className="inline-block w-2 h-2 rounded-full bg-slate-400"></span>
                        외부 일정
                    </div>
                </div>
                {/* Days of Week */}
                <div className="grid grid-cols-7 text-center text-xs font-bold text-slate-500 mb-2">
                    <div className="text-rose-500">일</div><div>월</div><div>화</div><div>수</div><div>목</div><div>금</div><div className="text-blue-500">토</div>
                </div>
                {/* Day Cells */}
                <div className="grid grid-cols-7 auto-rows-fr gap-1">
                    {calendarDays.map((day, idx) => {
                        const dayEvents = schedules.filter(s => isSameDay(new Date(s.startDate), day) || (new Date(s.startDate) <= day && new Date(s.endDate) >= day));
                        return (
                            <div
                                key={idx}
                                onClick={() => setSelectedDate(day)}
                                className={`relative p-1.5 sm:p-2 rounded-xl cursor-pointer transition-all border flex flex-col items-center min-h-16 sm:min-h-20 
                            ${!isSameMonth(day, monthStart) ? "text-slate-300 dark:text-slate-700 bg-slate-50/50 dark:bg-slate-900/30 border-transparent" : "bg-white dark:bg-slate-900/50 border-slate-100 dark:border-slate-800"}
                            ${isSameDay(day, selectedDate) ? "ring-2 ring-indigo-500 z-10" : "hover:bg-slate-50 dark:hover:bg-slate-800"}`}
                            >
                                <div className={`text-sm font-bold mb-1 flex justify-center items-center w-6 h-6 rounded-full mx-auto ${isToday(day) ? "bg-indigo-600 text-white" : ""}`}>
                                    {format(day, "d")}
                                </div>
                                <div className="flex flex-col gap-0.5 items-start text-left w-full overflow-hidden px-0.5">
                                    {dayEvents.slice(0, 2).map(evt => (
                                        <p key={evt.id} className={`text-[8px] leading-snug px-1 py-0.5 rounded-md w-full font-medium truncate ${getEventStyle(evt).cellBg} ${evt.isExternal ? 'text-slate-600 dark:text-slate-400' : 'text-slate-800 dark:text-slate-200'}`}>
                                            {evt.title}
                                        </p>
                                    ))}
                                    {dayEvents.length > 2 && (
                                        <div className="text-[7px] text-center text-slate-400 w-full px-1">+{dayEvents.length - 2}개</div>
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
                    <CalendarIcon className="w-5 h-5 text-indigo-500" />
                    {format(selectedDate, "M월 d일 (EEE)", { locale: ko })}
                </h3>
                <div className="space-y-3">
                    {dailySchedules.length > 0 ? dailySchedules.map(schedule => (
                        <div key={schedule.id} className={`p-4 rounded-2xl border-l-4 ${getEventStyle(schedule).card}`}>
                            <div className="font-bold text-sm flex items-center gap-2">
                                {schedule.isExternal && <ExternalLink className="w-3 h-3 text-slate-400" />}
                                {schedule.title}
                            </div>
                            <div className="text-xs text-slate-500 mt-1">
                                {schedule.isNEIS ? "NEIS 학사일정" : schedule.isExternal ? "외부 일정 (Google)" : schedule.category}
                            </div>
                            {schedule.description && (
                                <div className="text-xs text-slate-600 dark:text-slate-400 mt-1">
                                    {schedule.description}
                                </div>
                            )}
                        </div>
                    )) : (
                        <div className="text-center text-slate-500 py-12">일정이 없습니다.</div>
                    )}
                </div>
            </div>
        </div>
    )
}
