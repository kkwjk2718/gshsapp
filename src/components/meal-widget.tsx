"use client"

import { useState } from "react";
import { Utensils, ChevronRight } from "lucide-react";
import Link from "next/link";

interface MealData {
    DDISH_NM: string;
    MMEAL_SC_NM: string;
}

interface MealWidgetProps {
    breakfast: MealData | undefined;
    lunch: MealData | undefined;
    dinner: MealData | undefined;
    defaultMeal: "조식" | "중식" | "석식";
}

const cleanMealItem = (name: string) => {
    return name.replace(/\([^)]*\)/g, '').trim();
};

const getMealItems = (meal: MealData | undefined): string[] => {
    if (!meal) return [];
    return meal.DDISH_NM.split('<br/>').map(cleanMealItem).filter(Boolean);
};

export function MealWidget({ breakfast, lunch, dinner, defaultMeal }: MealWidgetProps) {
    const [selected, setSelected] = useState<"조식" | "중식" | "석식">(defaultMeal);

    const meals = { 조식: breakfast, 중식: lunch, 석식: dinner };
    const currentMeal = meals[selected];
    const mealItems = getMealItems(currentMeal);

    const titleMap = { 조식: "오늘의 조식", 중식: "오늘의 중식", 석식: "오늘의 석식" };

    return (
        <div className="glass-card p-6 flex flex-col flex-1 group">
            <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                    <Utensils className="w-4 h-4 text-orange-500 dark:text-orange-400" />
                    {titleMap[selected]}
                </h3>
                <Link href="/meals">
                    <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-orange-400 transition-colors" />
                </Link>
            </div>

            <div className="flex-1 bg-white dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl p-4 flex items-center justify-center">
                {mealItems.length > 0 ? (
                    <div className="flex flex-col gap-1 w-full items-center">
                        {mealItems.map((item, i) => (
                            <a
                                key={i}
                                href={`https://www.google.com/search?q=${encodeURIComponent(item)}&tbm=isch`}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-sm font-medium text-slate-800 dark:text-slate-300 hover:text-orange-500 dark:hover:text-orange-400 hover:underline transition-colors cursor-pointer"
                            >
                                {item}
                            </a>
                        ))}
                    </div>
                ) : (
                    <p className="text-sm text-slate-500">급식 정보가 없습니다.</p>
                )}
            </div>

            <div className="mt-4 flex gap-2">
                {(["조식", "중식", "석식"] as const).map((type) => (
                    <button
                        key={type}
                        onClick={() => setSelected(type)}
                        className={`flex-1 py-2 text-center rounded-xl text-xs font-bold transition-colors border ${
                            selected === type
                                ? "bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border-orange-300 dark:border-orange-500/20"
                                : "bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-500 border-slate-200 dark:border-white/5"
                        }`}
                    >
                        {type}
                    </button>
                ))}
            </div>
        </div>
    );
}
