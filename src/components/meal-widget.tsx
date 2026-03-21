"use client";

import Link from "next/link";
import { ChevronRight, Utensils } from "lucide-react";
import { useState } from "react";

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

const cleanMealItem = (name: string) => name.replace(/\([^)]*\)/g, "").trim();

const getMealItems = (meal: MealData | undefined): string[] => {
  if (!meal) {
    return [];
  }

  return meal.DDISH_NM.split("<br/>").map(cleanMealItem).filter(Boolean);
};

export function MealWidget({ breakfast, lunch, dinner, defaultMeal }: MealWidgetProps) {
  const [selected, setSelected] = useState<"조식" | "중식" | "석식">(defaultMeal);

  const meals = { 조식: breakfast, 중식: lunch, 석식: dinner };
  const currentMeal = meals[selected];
  const mealItems = getMealItems(currentMeal);

  const titleMap = {
    조식: "오늘의 조식",
    중식: "오늘의 중식",
    석식: "오늘의 석식",
  };

  const descriptionMap = {
    조식: "아침 시간을 위한 가벼운 메뉴",
    중식: "점심 시간에 제공되는 메인 식단",
    석식: "야간 자습 전후로 확인하는 저녁 식단",
  };

  return (
    <div className="glass-card flex h-full flex-col p-5 md:p-6">
      <div className="flex items-start justify-between gap-3">
        <div className="space-y-1">
          <div className="section-kicker">Meal Overview</div>
          <h3 className="flex items-center gap-2 text-lg font-semibold tracking-[-0.03em]" style={{ color: "var(--foreground)" }}>
            <Utensils className="h-4 w-4" style={{ color: "var(--accent)" }} />
            {titleMap[selected]}
          </h3>
          <p className="text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            {descriptionMap[selected]}
          </p>
        </div>

        <Link href="/meals" className="btn-glass px-3 py-2 text-xs">
          전체 급식
          <ChevronRight className="h-4 w-4" />
        </Link>
      </div>

      <div
        className="mt-4 flex flex-1 items-center justify-center rounded-[1.35rem] border p-4 md:p-5"
        style={{
          borderColor: "color-mix(in srgb, var(--border) 70%, transparent)",
          backgroundColor: "color-mix(in srgb, var(--surface-2) 82%, transparent)",
        }}
      >
        {mealItems.length > 0 ? (
          <div className="flex w-full flex-col gap-2">
            {mealItems.map((item, index) => (
              <a
                key={index}
                href={`https://www.google.com/search?q=${encodeURIComponent(item)}&tbm=isch`}
                target="_blank"
                rel="noopener noreferrer"
                className="rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:underline"
                style={{
                  color: "var(--foreground)",
                  backgroundColor: "color-mix(in srgb, var(--surface) 72%, transparent)",
                }}
              >
                {item}
              </a>
            ))}
          </div>
        ) : (
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            식단 정보가 아직 등록되지 않았습니다.
          </p>
        )}
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {(["조식", "중식", "석식"] as const).map((type) => (
          <button
            key={type}
            type="button"
            onClick={() => setSelected(type)}
            className="rounded-xl border px-3 py-2 text-center text-xs font-semibold transition-all"
            style={
              selected === type
                ? {
                    background:
                      "linear-gradient(135deg, color-mix(in srgb, var(--accent) 18%, var(--surface-2) 82%), color-mix(in srgb, var(--accent-2) 14%, var(--surface) 86%))",
                    color: "var(--foreground)",
                    borderColor: "color-mix(in srgb, var(--accent) 40%, var(--border) 60%)",
                  }
                : {
                    backgroundColor: "color-mix(in srgb, var(--surface-2) 78%, transparent)",
                    color: "var(--muted)",
                    borderColor: "color-mix(in srgb, var(--border) 74%, transparent)",
                  }
            }
          >
            {type}
          </button>
        ))}
      </div>
    </div>
  );
}
