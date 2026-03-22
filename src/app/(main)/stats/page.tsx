import { differenceInDays, format } from "date-fns";
import type { Metadata } from "next";
import { Activity, Flame, MousePointer2, Music, Users, Utensils } from "lucide-react";
import { getPublicStats } from "@/lib/stats";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "서비스 통계",
  description: "GSHS.app 전체 이용 통계를 확인할 수 있습니다.",
};

export default async function StatsPage() {
  const stats = await getPublicStats();
  const daysActive = differenceInDays(new Date(), stats.sinceDate) + 1;

  return (
    <div className="mx-auto max-w-5xl space-y-12 p-4 md:p-12">
      <div className="space-y-4 text-center">
        <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
          GSHS.app 서비스 통계
        </h1>
        <p className="text-lg text-slate-500">
          서비스 시작일{" "}
          <span className="font-bold text-indigo-600">
            {format(stats.sinceDate, "yyyy.MM.dd")}
          </span>
          부터{" "}
          <span className="font-bold text-indigo-600">
            {daysActive}
          </span>
          일간의 기록
        </p>
      </div>

      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-orange-500 to-rose-600 p-8 text-center text-white shadow-2xl transition-all duration-300 hover:scale-[1.02] md:p-12">
        <div className="absolute right-0 top-0 p-8 opacity-10">
          <Utensils className="h-64 w-64 rotate-12" />
        </div>
        <div className="relative z-10 flex flex-col items-center gap-4">
          <div className="mb-2 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-sm font-semibold text-white/90 backdrop-blur-md">
            <Flame className="h-4 w-4 animate-pulse text-amber-300" />
            경남과고 학생들의 급식에 대한 열기
          </div>
          <h2 className="break-keep text-2xl font-bold opacity-90 md:text-3xl">
            지금까지 학생들이 확인한 급식 횟수
          </h2>
          <div className="my-4 font-mono text-6xl font-black tracking-tight drop-shadow-lg md:text-8xl">
            {stats.totalMealViews.toLocaleString()}
          </div>
          <p className="mx-auto max-w-lg text-sm text-white/70 md:text-base">
            하루의 시작과 함께 가장 자주 확인되는 기능입니다.
            <br />
            급식 조회 기록을 기준으로 서비스 이용 흐름을 보여줍니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
        <div className="glass flex flex-col items-center justify-center gap-2 rounded-3xl p-6 text-center transition-transform hover:scale-105">
          <Activity className="mb-2 h-10 w-10 text-indigo-500" />
          <div className="text-4xl font-bold text-slate-800 dark:text-slate-100">
            {stats.totalPageViews.toLocaleString()}
          </div>
          <div className="text-sm font-medium text-slate-500">전체 페이지 조회</div>
        </div>

        <div className="glass flex flex-col items-center justify-center gap-2 rounded-3xl p-6 text-center transition-transform hover:scale-105">
          <Users className="mb-2 h-10 w-10 text-emerald-500" />
          <div className="text-4xl font-bold text-slate-800 dark:text-slate-100">
            {stats.totalVisitors.toLocaleString()}
          </div>
          <div className="text-sm font-medium text-slate-500">전체 방문자 수</div>
        </div>

        <div className="glass flex flex-col items-center justify-center gap-2 rounded-3xl p-6 text-center transition-transform hover:scale-105">
          <Music className="mb-2 h-10 w-10 text-rose-500" />
          <div className="text-4xl font-bold text-slate-800 dark:text-slate-100">
            {stats.totalSongRequests.toLocaleString()}
          </div>
          <div className="text-sm font-medium text-slate-500">전체 기상곡 신청</div>
        </div>

        <div className="glass flex flex-col items-center justify-center gap-2 rounded-3xl p-6 text-center transition-transform hover:scale-105">
          <MousePointer2 className="mb-2 h-10 w-10 text-amber-500" />
          <div className="text-4xl font-bold text-slate-800 dark:text-slate-100">
            {(stats.totalPageViews / daysActive).toFixed(0)}
          </div>
          <div className="text-sm font-medium text-slate-500">일일 평균 조회</div>
        </div>
      </div>

      <div className="glass relative rounded-3xl p-8">
        <div className="mb-8 flex flex-col items-center justify-between gap-6 md:flex-row">
          <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-100">
            <Activity className="h-6 w-6 text-indigo-500" />
            주간 서비스 트래픽 추이
          </h2>

          <div className="flex items-center gap-3 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 dark:border-slate-700 dark:bg-slate-800">
            <div className="text-xs text-slate-500">현재 서비스 상태</div>
            <div className="h-4 w-px bg-slate-300 dark:bg-slate-600" />
            <div className={`flex items-center gap-2 text-sm font-bold ${stats.currentLoad.color}`}>
              <div className="h-2 w-2 animate-pulse rounded-full bg-current" />
              {stats.currentLoad.status}
            </div>
            <div className="font-mono text-xs text-slate-400">
              ({stats.currentLoad.rpm} req/min)
            </div>
          </div>
        </div>

        <div className="relative z-10 mx-auto flex h-64 w-full max-w-4xl items-end justify-between gap-2 px-2 md:px-8">
          {stats.dailyTraffic.map((day, index) => {
            const heightPercentage = (day.count / stats.maxDailyTraffic) * 100;

            return (
              <div
                key={index}
                className="group relative flex h-full flex-1 flex-col items-center justify-end gap-2"
              >
                <div
                  className="relative w-full min-w-[20px] rounded-t-lg border-t-2 border-indigo-500 bg-gradient-to-t from-indigo-500/10 to-indigo-500/30 transition-all duration-500 hover:bg-indigo-500/20 dark:from-indigo-500/20 dark:to-indigo-500/40"
                  style={{ height: `${Math.max(heightPercentage, 2)}%` }}
                >
                  <div className="absolute bottom-full left-1/2 z-20 mb-2 hidden -translate-x-1/2 whitespace-nowrap rounded bg-slate-800 px-2 py-1 text-xs text-white shadow-lg group-hover:block">
                    {format(day.date, "M월 d일")}: <span className="font-bold">{day.count}</span>건
                  </div>
                </div>

                <div className="text-xs font-medium text-slate-500 dark:text-slate-400">
                  {format(day.date, "M.d (EEE)")}
                </div>
              </div>
            );
          })}
        </div>

        <div className="absolute left-0 right-0 top-32 h-px bg-slate-100 dark:bg-slate-800" />
        <div className="absolute left-0 right-0 top-56 h-px bg-slate-100 dark:bg-slate-800" />

        <p className="mt-8 text-center text-xs text-slate-400">
          최근 7일간 발생한 모든 페이지 조회 및 API 요청 건수를 기준으로 집계합니다.
        </p>
      </div>

      <div className="pb-8 text-center text-xs text-slate-400">
        * 통계는 실시간으로 집계되며, 내부 점검이나 비정상적인 접근 기록은 일부 제외될 수 있습니다.
      </div>
    </div>
  );
}
