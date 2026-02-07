"use client"

import { Info } from "lucide-react"
import {
    Tooltip,
    TooltipContent,
    TooltipProvider,
    TooltipTrigger,
} from "@/components/ui/tooltip"

export function MealInfoTooltip() {
    return (
        <TooltipProvider delayDuration={0}>
            <Tooltip>
                <TooltipTrigger asChild>
                    <button className="p-1.5 text-slate-400 hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300 transition-colors rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
                        <Info className="w-4 h-4" />
                        <span className="sr-only">급식 정보 안내</span>
                    </button>
                </TooltipTrigger>
                <TooltipContent side="bottom" className="max-w-[280px] text-center p-3 text-xs leading-relaxed">
                    <p>
                        본 급식 정보는 교육행정정보시스템(NEIS)에서 실시간으로 제공받고 있습니다.
                        <br className="my-1" />
                        학교 사정에 따라 실제 식단과 차이가 있거나 변동될 수 있습니다.
                    </p>
                </TooltipContent>
            </Tooltip>
        </TooltipProvider>
    )
}
