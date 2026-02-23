"use client"

import { useRouter, useSearchParams } from "next/navigation";
import { format, addDays, subDays } from "date-fns";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { ChangeEvent } from "react";
import { TimetableCalendar } from "./timetable-calendar";
import { TimetableInfoTooltip } from "./timetable-info-tooltip";

interface TimetableControlsProps {
    currentDate: Date;
    currentGrade: string;
    currentClass: string;
}

export function TimetableControls({ currentDate, currentGrade, currentClass }: TimetableControlsProps) {
    const router = useRouter();
    const searchParams = useSearchParams();

    const updateParams = (newParams: Record<string, string>) => {
        const params = new URLSearchParams(searchParams.toString());
        Object.entries(newParams).forEach(([key, value]) => {
            params.set(key, value);
        });
        router.push(`/timetable?${params.toString()}`);
    };

    const handlePrevDate = () => {
        updateParams({ date: format(subDays(currentDate, 1), "yyyyMMdd") });
    };

    const handleNextDate = () => {
        updateParams({ date: format(addDays(currentDate, 1), "yyyyMMdd") });
    };

    const handleGradeChange = (e: ChangeEvent<HTMLSelectElement>) => {
        // Reset class to 1 when grade changes to avoid out of range
        updateParams({ grade: e.target.value, classNum: "1" });
    };

    const handleClassChange = (e: ChangeEvent<HTMLSelectElement>) => {
        updateParams({ classNum: e.target.value });
    };

    const maxClass = currentGrade === "3" ? 4 : 5;

    return (
        <div className="flex flex-col items-center justify-center gap-4 mb-8">
            <div className="flex items-center gap-2">
                <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>시간표</h1>
                <TimetableInfoTooltip />
            </div>

            {/* Date Navigation */}
            <div className="flex items-center gap-2 sm:gap-4 p-2 rounded-2xl shadow-sm w-full max-w-sm justify-between" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
                <button onClick={handlePrevDate} className="p-2.5 tap-target rounded-xl transition-colors" style={{ color: "var(--foreground)" }}>
                    <ChevronLeft className="w-5 h-5" />
                </button>
                <TimetableCalendar currentDate={currentDate} />
                <button onClick={handleNextDate} className="p-2.5 tap-target rounded-xl transition-colors" style={{ color: "var(--foreground)" }}>
                    <ChevronRight className="w-5 h-5" />
                </button>
            </div>

            {/* Grade/Class Filter */}
            <div className="grid grid-cols-2 gap-2 w-full max-w-sm">
                <select
                    value={currentGrade}
                    onChange={handleGradeChange}
                    className="px-3 py-2 rounded-xl border text-sm focus:outline-none"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }}
                >
                    <option value="1">1학년</option>
                    <option value="2">2학년</option>
                    <option value="3">3학년</option>
                </select>
                <select
                    value={currentClass}
                    onChange={handleClassChange}
                    className="px-3 py-2 rounded-xl border text-sm focus:outline-none"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }}
                >
                    {Array.from({ length: maxClass }, (_, i) => i + 1).map(num => (
                        <option key={num} value={num}>{num}반</option>
                    ))}
                </select>
            </div>
        </div>
    );
}