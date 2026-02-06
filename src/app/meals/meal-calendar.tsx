"use client"

import * as React from "react"
import { format } from "date-fns"
import { ko } from "date-fns/locale"
import { Calendar as CalendarIcon } from "lucide-react"
import { useRouter } from "next/navigation"

import { cn } from "@/lib/utils"

interface MealCalendarProps {
    currentDate: Date
}

export function MealCalendar({ currentDate }: MealCalendarProps) {
    const router = useRouter()
    const inputRef = React.useRef<HTMLInputElement>(null)

    const handleDateChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const dateStr = e.target.value
        if (dateStr) {
            const formattedDate = dateStr.replace(/-/g, "") // YYYY-MM-DD -> YYYYMMDD
            router.push(`/meals?date=${formattedDate}`)
        }
    }

    // 버튼 클릭 시 숨겨진 input의 showPicker() 호출
    const handleButtonClick = () => {
        if (inputRef.current) {
            try {
                inputRef.current.showPicker()
            } catch (err) {
                // showPicker를 지원하지 않는 브라우저(구형)를 위한 폴백: focus
                inputRef.current.focus()
            }
        }
    }

    return (
        <div className="relative">
            {/* 날짜 표시 버튼 (커스텀 디자인) */}
            <button
                onClick={handleButtonClick}
                className={cn(
                    "flex items-center gap-2 text-lg font-semibold px-4 py-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors outline-none cursor-pointer"
                )}
            >
                <CalendarIcon className="w-5 h-5 text-indigo-500" />
                <span>{format(currentDate, "M월 d일 (EEE)", { locale: ko })}</span>
            </button>

            {/* 숨겨진 Native Date Input */}
            <input
                ref={inputRef}
                type="date"
                className="absolute top-0 left-0 w-full h-full opacity-0 cursor-pointer -z-10"
                value={format(currentDate, "yyyy-MM-dd")}
                onChange={handleDateChange}
                aria-label="날짜 선택"
            />
        </div>
    )
}
