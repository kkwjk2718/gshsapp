import { getPublicStats } from "@/lib/stats";
import { format, differenceInDays } from "date-fns";
import { Activity, Users, MousePointer2, Music, Utensils, Flame } from "lucide-react";
import { Metadata } from "next";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "서버 통계",
    description: "GSHS.app의 누적 사용 통계입니다.",
};

export default async function StatsPage() {
    const stats = await getPublicStats();
    const daysActive = differenceInDays(new Date(), stats.sinceDate) + 1;

    return (
        <div className="p-4 md:p-12 max-w-5xl mx-auto space-y-12">
            <div className="text-center space-y-4">
                <h1 className="text-3xl font-bold text-slate-800 dark:text-slate-100">
                    GSHS.app 서비스 통계
                </h1>
                <p className="text-slate-500 text-lg">
                    서비스 시작 <span className="font-bold text-indigo-600">{format(stats.sinceDate, "yyyy.MM.dd")}</span> 부터 <span className="font-bold text-indigo-600">{daysActive}</span>일간의 기록
                </p>
            </div>

            {/* Hero Card for Meal Views */}
            <div className="relative overflow-hidden bg-gradient-to-br from-orange-500 to-rose-600 rounded-3xl p-8 md:p-12 text-center text-white shadow-2xl transform hover:scale-[1.02] transition-all duration-300">
                <div className="absolute top-0 right-0 p-8 opacity-10">
                    <Utensils className="w-64 h-64 rotate-12" />
                </div>
                <div className="relative z-10 flex flex-col items-center gap-4">
                    <div className="inline-flex items-center gap-2 bg-white/20 backdrop-blur-md px-4 py-1.5 rounded-full text-sm font-semibold text-white/90 mb-2">
                        <Flame className="w-4 h-4 animate-pulse text-amber-300" />
                        경남과고 학생들의 급식 열정 🔥
                    </div>
                    <h2 className="text-2xl md:text-3xl font-bold opacity-90 break-keep">
                        학생들이 지금까지 확인한 급식 횟수!! 🍚
                    </h2>
                    <div className="text-6xl md:text-8xl font-black tracking-tight drop-shadow-lg my-4 font-mono">
                        {stats.totalMealViews.toLocaleString()}
                    </div>
                    <p className="text-white/70 text-sm md:text-base max-w-lg mx-auto">
                        우리는 밥심으로 공부합니다. 맛있는 급식 감사합니다! 🙇‍♂️
                    </p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="glass p-6 rounded-3xl flex flex-col items-center justify-center text-center gap-2 hover:scale-105 transition-transform">
                    <Activity className="w-10 h-10 text-indigo-500 mb-2" />
                    <div className="text-4xl font-bold text-slate-800 dark:text-slate-100">{stats.totalPageViews.toLocaleString()}</div>
                    <div className="text-sm text-slate-500 font-medium">누적 트래픽(요청)</div>
                </div>
                <div className="glass p-6 rounded-3xl flex flex-col items-center justify-center text-center gap-2 hover:scale-105 transition-transform">
                    <Users className="w-10 h-10 text-emerald-500 mb-2" />
                    <div className="text-4xl font-bold text-slate-800 dark:text-slate-100">{stats.totalVisitors.toLocaleString()}</div>
                    <div className="text-sm text-slate-500 font-medium">누적 방문자 수</div>
                </div>
                <div className="glass p-6 rounded-3xl flex flex-col items-center justify-center text-center gap-2 hover:scale-105 transition-transform">
                    <Music className="w-10 h-10 text-rose-500 mb-2" />
                    <div className="text-4xl font-bold text-slate-800 dark:text-slate-100">{stats.totalSongRequests.toLocaleString()}</div>
                    <div className="text-sm text-slate-500 font-medium">신청된 기상곡</div>
                </div>

                <div className="glass p-6 rounded-3xl flex flex-col items-center justify-center text-center gap-2 hover:scale-105 transition-transform">
                    <MousePointer2 className="w-10 h-10 text-amber-500 mb-2" />
                    <div className="text-4xl font-bold text-slate-800 dark:text-slate-100">{(stats.totalPageViews / daysActive).toFixed(0)}</div>
                    <div className="text-sm text-slate-500 font-medium">일일 평균 트래픽</div>
                </div>
            </div>

            <div className="glass p-8 rounded-3xl relative">
                <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
                    <h2 className="text-xl font-bold text-slate-800 dark:text-slate-100 flex items-center gap-2">
                        <Activity className="w-6 h-6 text-indigo-500" />
                        주간 서버 트래픽 추이
                    </h2>
                    <div className="flex items-center gap-3 px-4 py-2 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700">
                        <div className="text-xs text-slate-500">현재 서버 상태</div>
                        <div className="h-4 w-px bg-slate-300 dark:bg-slate-600" />
                        <div className={`text-sm font-bold flex items-center gap-2 ${stats.currentLoad.color}`}>
                            <div className="w-2 h-2 rounded-full bg-current animate-pulse" />
                            {stats.currentLoad.status}
                        </div>
                        <div className="text-xs text-slate-400 font-mono">
                            ({stats.currentLoad.rpm} req/min)
                        </div>
                    </div>
                </div>

                <div className="flex items-end justify-between gap-2 h-64 w-full max-w-4xl mx-auto px-2 md:px-8 relative z-10">
                    {stats.dailyTraffic.map((day, index) => {
                        const heightPercentage = (day.count / stats.maxDailyTraffic) * 100;

                        return (
                            <div key={index} className="flex-1 flex flex-col items-center gap-2 group relative h-full justify-end">
                                <div
                                    className="w-full min-w-[20px] bg-gradient-to-t from-indigo-500/10 to-indigo-500/30 dark:from-indigo-500/20 dark:to-indigo-500/40 rounded-t-lg border-t-2 border-indigo-500 relative transition-all duration-500 hover:bg-indigo-500/20"
                                    style={{ height: `${Math.max(heightPercentage, 2)}%` }}
                                >
                                    {/* Tooltip */}
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block bg-slate-800 text-white text-xs px-2 py-1 rounded whitespace-nowrap z-20 shadow-lg">
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

                {/* Background Grid Lines */}
                <div className="absolute left-0 right-0 top-32 h-px bg-slate-100 dark:bg-slate-800" />
                <div className="absolute left-0 right-0 top-56 h-px bg-slate-100 dark:bg-slate-800" />

                <p className="text-center text-xs text-slate-400 mt-8">
                    최근 7일간 발생한 모든 페이지 조회 및 API 요청 건수입니다.
                </p>
            </div>

            <div className="text-center text-xs text-slate-400 pb-8">
                * 통계는 실시간으로 집계되며, 봇이나 비정상적인 접근이 포함될 수 있습니다.
            </div>
        </div>
    );
}
