import type { Metadata } from "next";
import Link from "next/link";
import { addDays, format, parse, subDays } from "date-fns";
import { ko } from "date-fns/locale";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { MealViewTracker } from "@/components/meal-view-tracker";
import { ALLERGY_MAP, type MealInfo } from "@/lib/neis";
import { MealAllergyInfo } from "./meal-allergy-info";
import { MealCalendar } from "./meal-calendar";
import { MealInfoTooltip } from "./meal-info-tooltip";

export const metadata: Metadata = {
  title: "급식",
  description: "경남과학고 급식 식단과 알레르기 정보를 빠르게 확인하세요.",
};

interface FoodAllergyDetail {
  food: string;
  allergies: string[];
}

export default async function MealsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const dateStr = params.date || format(new Date(), "yyyyMMdd");

  const parsedDate = parse(dateStr, "yyyyMMdd", new Date());
  const currentDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;

  const prevDate = format(subDays(currentDate, 1), "yyyyMMdd");
  const nextDate = format(addDays(currentDate, 1), "yyyyMMdd");

  const currYear = currentDate.getFullYear().toString();
  const currMonth = `${currentDate.getMonth() + 1}`.padStart(2, "0");

  const prevMonthDate = subDays(currentDate, 30);
  const nextMonthDate = addDays(currentDate, 30);

  const pmYear = prevMonthDate.getFullYear().toString();
  const pmMonth = `${prevMonthDate.getMonth() + 1}`.padStart(2, "0");
  const nmYear = nextMonthDate.getFullYear().toString();
  const nmMonth = `${nextMonthDate.getMonth() + 1}`.padStart(2, "0");

  const { getMonthlyMeals } = await import("@/lib/neis");
  const [, currMeals] = await Promise.all([
    getMonthlyMeals(pmYear, pmMonth),
    getMonthlyMeals(currYear, currMonth),
    getMonthlyMeals(nmYear, nmMonth),
  ]);

  const meals = currMeals.filter((meal) => meal.MLSV_YMD === dateStr);

  const parseAllergiesByFood = (dishName: string): FoodAllergyDetail[] => {
    const foodItems: FoodAllergyDetail[] = [];
    const parts = dishName.split(/<br\s*\/?>/gi).map((part) => part.trim());

    parts.forEach((part) => {
      const match = part.match(/^(.*?)\(([^)]*)\)$/);

      if (match) {
        const food = match[1].trim();
        const allergyCodesOrNames = match[2].split(/[,.]/).map((item) => item.trim());
        const allergies: string[] = [];

        allergyCodesOrNames.forEach((item) => {
          if (/^\d+$/.test(item) && ALLERGY_MAP[item]) {
            allergies.push(ALLERGY_MAP[item]);
          } else if (item && !["일반", "대", "선택"].includes(item)) {
            allergies.push(item);
          }
        });

        if (food) {
          foodItems.push({ food, allergies: Array.from(new Set(allergies)) });
        }
        return;
      }

      const cleanPart = part.replace(/\([^)]*\)/g, "").trim();
      if (cleanPart && !["일반", "대", "선택"].includes(cleanPart)) {
        foodItems.push({ food: cleanPart, allergies: [] });
      }
    });

    return foodItems;
  };

  const getMealByType = (type: string) => meals.find((meal) => meal.MMEAL_SC_NM === type);
  const breakfast = getMealByType("조식");
  const lunch = getMealByType("중식");
  const dinner = getMealByType("석식");

  const MealCard = ({ title, data, tone }: { title: string; data?: MealInfo; tone: string }) => {
    const foodAllergies = data ? parseAllergiesByFood(data.DDISH_NM) : [];
    const hasAllergyInfo = foodAllergies.some((item) => item.allergies.length > 0);

    return (
      <div className="glass-card flex min-h-[18rem] flex-col p-5 md:p-6">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="section-kicker">{title}</div>
            <h2 className="mt-2 text-[1.2rem] font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
              {title} 메뉴
            </h2>
          </div>

          <div className="flex items-center gap-2">
            {data?.CAL_INFO ? (
              <span className="rounded-full border px-3 py-1 text-[11px] font-semibold" style={{ borderColor: tone, color: tone }}>
                {data.CAL_INFO}
              </span>
            ) : null}
            {hasAllergyInfo || data?.CAL_INFO ? (
              <MealAllergyInfo foodAllergies={foodAllergies} calorie={data?.CAL_INFO} />
            ) : null}
          </div>
        </div>

        <div
          className="mt-4 flex flex-1 flex-col justify-center gap-2 rounded-[1.35rem] border p-4"
          style={{
            borderColor: "color-mix(in srgb, var(--border) 70%, transparent)",
            backgroundColor: "color-mix(in srgb, var(--surface-2) 78%, transparent)",
          }}
        >
          {data ? (
            data.DDISH_NM.split(/<br\s*\/?>/gi).map((dish, index) => {
              const cleanName = dish.replace(/\([^)]*\)/g, "").trim();
              if (!cleanName) {
                return null;
              }

              return (
                <a
                  key={index}
                  href={`https://www.google.com/search?q=${encodeURIComponent(cleanName)}&tbm=isch`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:underline"
                  style={{
                    color: "var(--foreground)",
                    backgroundColor: "color-mix(in srgb, var(--surface) 74%, transparent)",
                  }}
                >
                  {cleanName}
                </a>
              );
            })
          ) : (
            <div className="text-center text-sm" style={{ color: "var(--muted)" }}>
              등록된 식단 정보가 없습니다.
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="page-shell">
      <MealViewTracker />

      <div className="page-shell-narrow space-y-4 md:space-y-5">
        <section className="glass-strong px-5 py-5 md:px-6 md:py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="info-chip">식단 {meals.length}개 제공</span>
                <span className="info-chip">알레르기 정보 함께 확인</span>
              </div>

              <div>
                <div className="section-kicker">Meal Dashboard</div>
                <div className="mt-1 flex items-center gap-2">
                  <h1 className="section-title">급식 식단</h1>
                  <MealInfoTooltip />
                </div>
                <p className="section-copy mt-3">
                  {format(currentDate, "yyyy년 M월 d일 (EEE)", { locale: ko })} 기준으로
                  조식, 중식, 석식 식단을 한 번에 확인할 수 있습니다.
                </p>
              </div>
            </div>

            <div
              className="flex flex-col gap-3 rounded-[1.5rem] border p-3 md:flex-row md:items-center"
              style={{
                backgroundColor: "color-mix(in srgb, var(--surface-2) 82%, transparent)",
                borderColor: "color-mix(in srgb, var(--border) 72%, transparent)",
              }}
            >
              <Link href={`/meals?date=${prevDate}`} className="btn-glass h-11 w-11 px-0 py-0">
                <ChevronLeft className="h-4 w-4" />
              </Link>
              <MealCalendar currentDate={currentDate} />
              <Link href={`/meals?date=${nextDate}`} className="btn-glass h-11 w-11 px-0 py-0">
                <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-3">
          <MealCard title="조식" data={breakfast} tone="var(--accent-2)" />
          <MealCard title="중식" data={lunch} tone="var(--accent)" />
          <MealCard title="석식" data={dinner} tone="color-mix(in srgb, var(--accent-2) 58%, var(--accent) 42%)" />
        </section>
      </div>
    </div>
  );
}
