"use client";

import { useState } from "react";
import Link from "next/link";
import { Utensils, ChevronRight } from "lucide-react";

type MealType = "조식" | "중식" | "석식";

interface Meal {
    DDISH_NM: string;
    MMEAL_SC_NM: string;
}

interface MealWidgetProps {
    breakfast?: Meal;
    lunch?: Meal;
    dinner?: Meal;
    defaultMeal?: MealType;
}

function cleanMealName(name: string) {
    return name.replace(/\([^)]*\)/g, "").replace(/<br\/>/g, "\n").trim();
}

const mealTitles: Record<MealType, string> = {
    조식: "오늘의 조식",
    중식: "오늘의 중식",
    석식: "오늘의 석식",
};

export function MealWidget({ breakfast, lunch, dinner, defaultMeal = "중식" }: MealWidgetProps) {
    const [selected, setSelected] = useState<MealType>(defaultMeal);

    const meals: Record<MealType, Meal | undefined> = { 조식: breakfast, 중식: lunch, 석식: dinner };
    const currentMeal = meals[selected];

    return (
        <div className="glass-card p-6 flex flex-col flex-1">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                    <Utensils className="w-4 h-4 text-orange-500 dark:text-orange-400" />
                    {mealTitles[selected]}
                </h3>
                <Link href="/meals" className="group">
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-orange-400 transition-colors" />
                </Link>
            </div>

            <Link href="/meals" className="flex-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl p-4 flex items-center justify-center">
                <p className="text-slate-800 dark:text-slate-300 whitespace-pre-wrap text-center leading-loose font-medium text-sm">
                    {currentMeal ? cleanMealName(currentMeal.DDISH_NM) : "급식 정보가 없습니다."}
                </p>
            </Link>

            <div className="mt-4 flex gap-2">
                {(["조식", "중식", "석식"] as MealType[]).map((meal) => (
                    <button
                        key={meal}
                        onClick={() => setSelected(meal)}
                        className={`flex-1 py-2 text-center rounded-xl text-xs font-bold transition-colors ${
                            selected === meal
                                ? "bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-300 dark:border-orange-500/20"
                                : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-white/5"
                        }`}
                    >
                        {meal}
                    </button>
                ))}
            </div>
        </div>
    );
}
