import { getMeals, MealInfo, ALLERGY_MAP } from "@/lib/neis";
import { format, addDays, subDays, parse } from "date-fns";
import { ko } from "date-fns/locale";
import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Metadata } from "next";
import { MealAllergyInfo } from "./meal-allergy-info";
import { MealCalendar } from "./meal-calendar";
import { MealInfoTooltip } from "./meal-info-tooltip";
import { MealViewTracker } from "@/components/meal-view-tracker";

export const metadata: Metadata = {
  title: "급식",
  description: "경남과학고등학교 오늘의 급식 식단 정보입니다.",
};

interface FoodAllergyDetail {
  food: string;
  allergies: string[];
}

export default async function MealsPage({ searchParams }: { searchParams: Promise<{ date?: string }> }) {
  const params = await searchParams;
  const dateStr = params.date || format(new Date(), "yyyyMMdd");

  let currentDate = new Date();
  try {
    currentDate = parse(dateStr, "yyyyMMdd", new Date());
  } catch (e) {
    console.error(e);
    currentDate = new Date();
  }

  const prevDate = format(subDays(currentDate, 1), "yyyyMMdd");
  const nextDate = format(addDays(currentDate, 1), "yyyyMMdd");

  // [Cache Optimization]
  // Fetch Prev, Current, Next MONTH data to warm up the cache as requested.
  const currYear = currentDate.getFullYear().toString();
  const currMonth = (currentDate.getMonth() + 1).toString().padStart(2, '0');

  const prevMonthDate = subDays(currentDate, 30);
  const nextMonthDate = addDays(currentDate, 30);

  const pmYear = prevMonthDate.getFullYear().toString();
  const pmMonth = (prevMonthDate.getMonth() + 1).toString().padStart(2, '0');

  const nmYear = nextMonthDate.getFullYear().toString();
  const nmMonth = (nextMonthDate.getMonth() + 1).toString().padStart(2, '0');

  // Pre-fetch all 3 months in parallel
  // We dynamic import to avoid circular dependency if any? No, direct import is fine.
  // We use Promise.all to fetch them.
  // Note: getMonthlyMeals is cached.
  const importNeis = await import("@/lib/neis");
  const [prevMeals, currMeals, nextMeals] = await Promise.all([
    importNeis.getMonthlyMeals(pmYear, pmMonth),
    importNeis.getMonthlyMeals(currYear, currMonth),
    importNeis.getMonthlyMeals(nmYear, nmMonth),
  ]);

  // Filter current date's meal from the monthly list
  const meals = currMeals.filter(m => m.MLSV_YMD === dateStr);

  // 음식별 알레르기 정보 파싱 함수 (개선: <br/> 기준 분리)
  const parseAllergiesByFood = (dishName: string): FoodAllergyDetail[] => {
    const foodItems: FoodAllergyDetail[] = [];
    // <br/> 태그로 분리 (대소문자, 공백 허용)
    const parts = dishName.split(/<br\s*\/?>/gi).map(p => p.trim());

    parts.forEach(part => {
      const match = part.match(/^(.*?)\(([^)]*)\)$/); // '음식명(알레르기)' 형식 파싱

      if (match) {
        const food = match[1].trim();
        const allergyCodesOrNames = match[2].split(/[,.]/).map(s => s.trim());
        const allergies: string[] = [];

        allergyCodesOrNames.forEach(item => {
          if (/^\d+$/.test(item) && ALLERGY_MAP[item]) {
            allergies.push(ALLERGY_MAP[item]);
          } else if (item && !['일반', '쌀', '선택'].includes(item)) {
            allergies.push(item);
          }
        });

        if (food) {
          foodItems.push({ food, allergies: Array.from(new Set(allergies)) });
        }
      } else {
        // 괄호가 없는 음식
        const cleanPart = part.replace(/\([^)]*\)/g, '').trim(); // 혹시 모를 괄호 제거
        if (cleanPart && !['일반', '쌀', '선택'].includes(cleanPart)) {
          foodItems.push({ food: cleanPart, allergies: [] });
        }
      }
    });
    return foodItems;
  };

  const getMealByType = (type: string) => meals.find(m => m.MMEAL_SC_NM === type);
  const breakfast = getMealByType("조식");
  const lunch = getMealByType("중식");
  const dinner = getMealByType("석식");

  const MealCard = ({ title, data }: { title: string, data?: MealInfo }) => {
    const foodAllergies = data ? parseAllergiesByFood(data.DDISH_NM) : [];
    const hasAllergyInfo = foodAllergies.some(item => item.allergies.length > 0);

    return (
      <div className="glass p-6 rounded-3xl flex flex-col gap-4 min-h-[250px] relative">
        <div className="flex items-center justify-between relative z-10">
          <div className="px-3 py-1 rounded-full text-sm font-bold" style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}>
            {title}
          </div>
          <div className="flex items-center gap-2">
            {data && <div className="text-xs" style={{ color: "var(--muted)" }}>열량: {data.CAL_INFO}</div>}
            {(hasAllergyInfo || data?.CAL_INFO) && <MealAllergyInfo foodAllergies={foodAllergies} calorie={data?.CAL_INFO} />}
          </div>
        </div>

        <div className="flex-1 flex flex-col justify-center gap-1.5 relative z-0">
          {data ? (
            data.DDISH_NM.split(/<br\s*\/?>/gi).map((dish, index) => {
              // 화면 표시용: 알레르기 정보(괄호) 제거
              const cleanName = dish.replace(/\([^)]*\)/g, '').trim();
              if (!cleanName) return null;
              return (
                <a
                  key={index}
                  href={`https://www.google.com/search?q=${encodeURIComponent(cleanName)}&tbm=isch`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-base font-medium text-center leading-snug hover:underline transition-colors"
                  style={{ color: "var(--foreground)" }}
                >
                  {cleanName}
                </a>
              );
            })
          ) : (
            <div className="text-center" style={{ color: "var(--muted)" }}>급식 정보가 없습니다.</div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="mobile-page mobile-safe-bottom space-y-6">
      <MealViewTracker />
      {/* Header & Nav */}
      <div className="flex flex-col items-center justify-center gap-1 mb-8 relative">
        <div className="flex items-center gap-2">
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>급식 식단</h1>
          <MealInfoTooltip />
        </div>
        <div className="flex items-center gap-2 mt-4 p-2 rounded-2xl shadow-sm" style={{ backgroundColor: "var(--surface)", border: "1px solid var(--border)" }}>
          <Link href={`/meals?date=${prevDate}`} className="p-2 rounded-xl transition-colors" style={{ color: "var(--foreground)" }}>
            <ChevronLeft className="w-5 h-5" />
          </Link>

          <MealCalendar currentDate={currentDate} />

          <Link href={`/meals?date=${nextDate}`} className="p-2 rounded-xl transition-colors" style={{ color: "var(--foreground)" }}>
            <ChevronRight className="w-5 h-5" />
          </Link>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        <MealCard title="조식" data={breakfast} />
        <MealCard title="중식" data={lunch} />
        <MealCard title="석식" data={dinner} />
      </div>
    </div>
  );
}
