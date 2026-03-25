import type { Metadata } from "next";
import Link from "next/link";
import { differenceInDays } from "date-fns";
import { BookOpen, Calendar, ChevronRight, Music } from "lucide-react";
import { getMeals } from "@/lib/neis";
import { getKSTDate, getKSTDateKey } from "@/lib/date-utils";
import { getHomePublicNotices, getNextAcademicSchedule } from "@/lib/public-content";
import { NoticeRollingBanner } from "@/components/notice-rolling-banner";
import { MealViewTracker } from "@/components/meal-view-tracker";
import { MealWidget } from "@/components/meal-widget";
import { HomeTimetableCard, HomeWelcomeCard } from "./home-personalization";
import type { HomeDdayPayload } from "@/lib/user-state";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "홈",
  description: "경남과학고 학생 생활 정보를 한곳에서 확인하세요.",
  alternates: { canonical: "/" },
};

function formatDday(title: string, targetDate: Date, today: Date): HomeDdayPayload {
  const diff = differenceInDays(targetDate, today);

  return {
    title,
    count: diff === 0 ? "D-Day" : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`,
    text: diff === 0 ? "오늘입니다." : diff > 0 ? "남았습니다." : "지났습니다.",
    prefix: diff >= 0 ? "까지" : "부터",
  };
}

export default async function Home() {
  const koreaToday = getKSTDate();
  const currentHour = koreaToday.getHours();
  const formattedDate = getKSTDateKey(koreaToday);

  const [meals, notices, academicDDay] = await Promise.all([
    getMeals(formattedDate),
    getHomePublicNotices(),
    getNextAcademicSchedule(),
  ]);

  const breakfast = meals.find((meal) => meal.MMEAL_SC_NM === "조식");
  const lunch = meals.find((meal) => meal.MMEAL_SC_NM === "중식");
  const dinner = meals.find((meal) => meal.MMEAL_SC_NM === "석식");

  const publicDDay = academicDDay
    ? formatDday(academicDDay.title, academicDDay.startDate, koreaToday)
    : null;

  return (
    <div
      data-testid="home-content-shell"
      className="mobile-page mobile-safe-bottom mx-auto w-full max-w-5xl xl:max-w-7xl xl:px-10 2xl:max-w-[88rem] 2xl:px-12"
    >
      <MealViewTracker />

      <main
        data-testid="home-main-grid"
        className="grid grid-cols-1 gap-4 md:pt-6 md:grid-cols-2 xl:grid-cols-12 xl:gap-5"
      >
        <div className="flex flex-col gap-4 xl:col-span-7 xl:gap-5">
          <div className="glass-card relative flex min-h-[124px] items-center justify-between gap-4 overflow-hidden p-6 group xl:min-h-[136px] xl:px-7">
            <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.03] to-purple-500/[0.03] transition-all" />
            <HomeWelcomeCard publicDDay={publicDDay} />
          </div>

          <div className="glass-card glass-card-hover relative flex min-h-[180px] flex-col overflow-hidden p-5 group xl:min-h-[200px] xl:p-6">
            <div className="mb-4 flex items-center justify-between xl:mb-5">
              <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                오늘의 시간표
              </h3>
              <Link href="/timetable">
                <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
              </Link>
            </div>

            <HomeTimetableCard />
          </div>

          <div className="glass-card flex flex-col gap-2 p-5 xl:p-6">
            <NoticeRollingBanner notices={notices} />
          </div>
        </div>

        <div className="flex flex-col gap-4 xl:col-span-5 xl:gap-5">
          <MealWidget
            breakfast={breakfast}
            lunch={lunch}
            dinner={dinner}
            defaultMeal={currentHour >= 14 ? "석식" : currentHour < 8 ? "조식" : "중식"}
          />

          <div className="grid grid-cols-3 gap-4 xl:gap-5">
            <Link href="/songs" className="glass-card glass-card-hover flex min-h-[112px] flex-col items-center justify-center gap-2 p-4 text-center xl:min-h-[128px] xl:gap-3">
              <div
                className="w-10 h-10 rounded-full border flex items-center justify-center"
                style={{ backgroundColor: "var(--surface-2)", borderColor: "var(--border)", color: "var(--accent)" }}
              >
                <Music className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold" style={{ color: "var(--foreground)" }}>기상곡</span>
            </Link>
            <Link href="/calendar" className="glass-card glass-card-hover flex min-h-[112px] flex-col items-center justify-center gap-2 p-4 text-center xl:min-h-[128px] xl:gap-3">
              <div
                className="w-10 h-10 rounded-full border flex items-center justify-center"
                style={{ backgroundColor: "var(--surface-2)", borderColor: "var(--border)", color: "var(--accent)" }}
              >
                <Calendar className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold" style={{ color: "var(--foreground)" }}>학사일정</span>
            </Link>
            <Link href="/links" className="glass-card glass-card-hover flex min-h-[112px] flex-col items-center justify-center gap-2 p-4 text-center xl:min-h-[128px] xl:gap-3">
              <div
                className="w-10 h-10 rounded-full border flex items-center justify-center"
                style={{ backgroundColor: "var(--surface-2)", borderColor: "var(--border)", color: "var(--accent)" }}
              >
                <BookOpen className="w-5 h-5" />
              </div>
              <span className="text-xs font-bold" style={{ color: "var(--foreground)" }}>링크모음</span>
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
