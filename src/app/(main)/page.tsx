import type { Metadata } from "next";
import Link from "next/link";
import { differenceInDays, format } from "date-fns";
import {
  ArrowRight,
  BookOpen,
  CalendarDays,
  LayoutGrid,
  Megaphone,
  Music4,
  Sparkles,
} from "lucide-react";
import { MealViewTracker } from "@/components/meal-view-tracker";
import { MealWidget } from "@/components/meal-widget";
import { NoticeRollingBanner } from "@/components/notice-rolling-banner";
import { getKSTDate } from "@/lib/date-utils";
import type { HomeDdayPayload } from "@/lib/user-state";
import { getMeals } from "@/lib/neis";
import { getHomePublicNotices, getNextAcademicSchedule } from "@/lib/public-content";
import { HomeTimetableCard, HomeWelcomeCard } from "./home-personalization";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "홈",
  description: "경남과학고 학생 생활에 필요한 핵심 정보를 한 화면에서 확인하세요.",
  alternates: { canonical: "/" },
};

function formatDday(title: string, targetDate: Date, today: Date): HomeDdayPayload {
  const diff = differenceInDays(targetDate, today);

  return {
    title,
    count: diff === 0 ? "D-Day" : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`,
    text: diff === 0 ? "오늘입니다." : diff > 0 ? "남았습니다." : "지났습니다.",
    prefix: diff >= 0 ? "까지" : "로부터",
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
  const mealCount = [breakfast, lunch, dinner].filter(Boolean).length;

  const publicDDay = academicDDay ? formatDday(academicDDay.title, academicDDay.startDate, koreaToday) : null;

  return (
    <div className="page-shell">
      <MealViewTracker />

      <main className="page-shell-narrow space-y-4 md:space-y-5">
        <section className="glass-strong relative overflow-hidden px-5 py-5 md:px-6 md:py-6">
          <div className="hero-orb left-[-3rem] top-[-4rem] h-36 w-36 bg-[color:var(--accent-glow)]" />
          <div className="hero-orb right-[-2rem] top-10 h-40 w-40 bg-[color:var(--panel-glow)] [animation-delay:-4s]" />

          <div className="grid gap-4 xl:grid-cols-[1.3fr_0.95fr]">
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="info-chip">
                  <Sparkles className="h-3.5 w-3.5" />
                  실시간 학생 허브
                </span>
                <span className="info-chip">
                  <LayoutGrid className="h-3.5 w-3.5" />
                  오늘 필요한 정보만 빠르게
                </span>
              </div>

              <div className="glass-card relative overflow-hidden p-5 md:p-6">
                <HomeWelcomeCard publicDDay={publicDDay} />
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:grid-cols-1">
              <div className="glass-card p-4 md:p-5">
                <div className="section-kicker">Academic Focus</div>
                <div className="mt-2 text-lg font-semibold tracking-[-0.03em]" style={{ color: "var(--foreground)" }}>
                  {publicDDay ? publicDDay.title : "다음 일정 준비 중"}
                </div>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  {publicDDay ? `${publicDDay.prefix} ${publicDDay.count} ${publicDDay.text}` : "표시할 학사 일정이 없습니다."}
                </p>
              </div>

              <div className="glass-card p-4 md:p-5">
                <div className="section-kicker">Notice Count</div>
                <div className="mt-2 text-3xl font-semibold tracking-[-0.05em]" style={{ color: "var(--foreground)" }}>
                  {String(notices.length).padStart(2, "0")}
                </div>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  학교에서 확인해야 할 최신 공지사항이 준비되어 있습니다.
                </p>
              </div>

              <div className="glass-card p-4 md:p-5">
                <div className="section-kicker">Meal Status</div>
                <div className="mt-2 text-3xl font-semibold tracking-[-0.05em]" style={{ color: "var(--foreground)" }}>
                  {mealCount}
                </div>
                <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                  오늘 제공되는 식단 수를 기준으로 빠르게 확인할 수 있습니다.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="grid gap-4 xl:grid-cols-[1.04fr_0.96fr]">
          <div className="space-y-4">
            <div className="glass-card p-5 md:p-6">
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <div className="section-kicker">Today Timetable</div>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
                    오늘의 시간표
                  </h2>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                    로그인하면 학년과 반 기준 시간표를 자동으로 확인할 수 있습니다.
                  </p>
                </div>
                <Link href="/timetable" className="btn-glass px-3 py-2 text-xs">
                  시간표 전체 보기
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
              <HomeTimetableCard />
            </div>

            <div className="glass-card p-5 md:p-6">
              <NoticeRollingBanner notices={notices} />
              <div className="mt-5 space-y-2">
                {notices.slice(0, 3).map((notice) => (
                  <Link
                    key={notice.id}
                    href={`/notices/${notice.id}`}
                    className="flex items-start justify-between gap-3 rounded-[1.1rem] border px-4 py-3 transition-colors hover:bg-[color:var(--surface)]"
                    style={{ borderColor: "color-mix(in srgb, var(--border) 62%, transparent)" }}
                  >
                    <div className="min-w-0">
                      <div className="line-clamp-1 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                        {notice.title}
                      </div>
                      <p className="mt-1 line-clamp-1 text-xs" style={{ color: "var(--muted)" }}>
                        {notice.content}
                      </p>
                    </div>
                    <ArrowRight className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--muted)" }} />
                  </Link>
                ))}
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <MealWidget
              breakfast={breakfast}
              lunch={lunch}
              dinner={dinner}
              defaultMeal={currentHour >= 14 ? "석식" : currentHour < 8 ? "조식" : "중식"}
            />

            <div className="glass-card p-5 md:p-6">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <div className="section-kicker">Quick Access</div>
                  <h2 className="mt-1 text-xl font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
                    자주 여는 메뉴
                  </h2>
                </div>
                <Megaphone className="h-5 w-5" style={{ color: "var(--accent)" }} />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                {[
                  { href: "/songs", icon: Music4, title: "기상곡", copy: "신청과 현황 확인" },
                  { href: "/calendar", icon: CalendarDays, title: "학사일정", copy: "중요 일정 보기" },
                  { href: "/links", icon: BookOpen, title: "바로가기", copy: "자주 쓰는 내부 링크" },
                  { href: "/sites", icon: LayoutGrid, title: "교내 사이트", copy: "관련 사이트 모음" },
                ].map((item) => (
                  <Link key={item.href} href={item.href} className="glass-card glass-card-hover flex items-start gap-3 p-4">
                    <span className="icon-badge shrink-0">
                      <item.icon className="h-4 w-4" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                        {item.title}
                      </span>
                      <span className="mt-1 block text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                        {item.copy}
                      </span>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
