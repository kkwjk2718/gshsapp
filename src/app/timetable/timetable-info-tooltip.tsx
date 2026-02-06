"use client"

import { Info } from "lucide-react"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

export function TimetableInfoTooltip() {
    return (
        <TooltipProvider delayDuration={0}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer">
                        <Info className="w-4 h-4" />
                        <span className="sr-only">시간표 정보 안내</span>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[280px] text-center p-3 text-xs leading-relaxed">
                    <p>
                        본 시간표 정보는 교육행정정보시스템(NEIS)에서 실시간으로 제공받고 있습니다.
                        <br className="my-1" />
                        학교 행사나 학사일정 변경 등으로 인해 실제 시간표와 다를 수 있습니다.
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
