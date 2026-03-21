import type { Metadata } from "next";
import Link from "next/link";
import { format, differenceInDays } from "date-fns";
import { Bell, BookOpen, Calendar, ChevronRight, Music } from "lucide-react";
import { getMeals } from "@/lib/neis";
import { getKSTDate } from "@/lib/date-utils";
import { getHomePublicNotices, getNextAcademicSchedule } from "@/lib/public-content";
import { NoticeRollingBanner } from "@/components/notice-rolling-banner";
import { RealtimeClock } from "@/components/dashboard-widgets";
import { WeatherWidget } from "@/components/weather-widget";
import { NotificationBadge } from "@/components/layout/notification-badge";
import { MealViewTracker } from "@/components/meal-view-tracker";
import { MealWidget } from "@/components/meal-widget";
import { HomeHeaderMeta, HomePersonalizationProvider, HomeTimetableCard, HomeWelcomeCard } from "./home-personalization";
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
  const formattedDate = format(koreaToday, "yyyyMMdd");

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
    <HomePersonalizationProvider>
      <div className="mobile-page mobile-safe-bottom md:pb-6 max-w-5xl mx-auto">
        <MealViewTracker />

        <header className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>GSHS.app</h1>
            <div className="text-xs flex items-center gap-2 mt-1" style={{ color: "var(--muted)" }}>
              <RealtimeClock compact />
              <HomeHeaderMeta />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <WeatherWidget />
            <Link
              href="/notifications"
              className="p-2 rounded-full transition-colors cursor-pointer relative"
              style={{ backgroundColor: "var(--surface-2)" }}
            >
              <Bell className="w-5 h-5" />
              <NotificationBadge className="w-2.5 h-2.5 top-2 right-2 border-slate-50 dark:border-slate-900" />
            </Link>
          </div>
        </header>

        <main className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex flex-col gap-4">
            <div className="glass-card p-6 relative overflow-hidden flex items-center justify-between gap-4 group min-h-[124px]">
              <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/[0.03] to-purple-500/[0.03] transition-all" />
              <HomeWelcomeCard publicDDay={publicDDay} />
            </div>

            <div className="glass-card glass-card-hover p-5 flex flex-col min-h-[180px] relative overflow-hidden group">
              <div className="flex items-center justify-between mb-4">
                <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                  오늘의 시간표
                </h3>
                <Link href="/timetable">
                  <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" />
                </Link>
              </div>

              <HomeTimetableCard />
            </div>

            <div className="glass-card p-5 flex flex-col gap-2">
              <NoticeRollingBanner notices={notices} />
            </div>
          </div>

          <div className="flex flex-col gap-4">
            <MealWidget
              breakfast={breakfast}
              lunch={lunch}
              dinner={dinner}
              defaultMeal={currentHour >= 14 ? "석식" : currentHour < 8 ? "조식" : "중식"}
            />

            <div className="grid grid-cols-3 gap-4">
              <Link href="/songs" className="glass-card glass-card-hover p-4 flex flex-col items-center justify-center gap-2 text-center">
                <div
                  className="w-10 h-10 rounded-full border flex items-center justify-center"
                  style={{ backgroundColor: "var(--surface-2)", borderColor: "var(--border)", color: "var(--accent)" }}
                >
                  <Music className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold" style={{ color: "var(--foreground)" }}>기상곡</span>
              </Link>
              <Link href="/calendar" className="glass-card glass-card-hover p-4 flex flex-col items-center justify-center gap-2 text-center">
                <div
                  className="w-10 h-10 rounded-full border flex items-center justify-center"
                  style={{ backgroundColor: "var(--surface-2)", borderColor: "var(--border)", color: "var(--accent)" }}
                >
                  <Calendar className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold" style={{ color: "var(--foreground)" }}>학사일정</span>
              </Link>
              <Link href="/links" className="glass-card glass-card-hover p-4 flex flex-col items-center justify-center gap-2 text-center">
                <div
                  className="w-10 h-10 rounded-full border flex items-center justify-center"
                  style={{ backgroundColor: "var(--surface-2)", borderColor: "var(--border)", color: "var(--accent)" }}
                >
                  <BookOpen className="w-5 h-5" />
                </div>
                <span className="text-xs font-bold" style={{ color: "var(--foreground)" }}>바로가기</span>
              </Link>
            </div>
          </div>
        </main>
      </div>
    </HomePersonalizationProvider>
  );
}
