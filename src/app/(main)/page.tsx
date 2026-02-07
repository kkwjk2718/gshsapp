import { getMeals, getTimetable } from "@/lib/neis";
import { format, differenceInDays } from "date-fns";
import { ko } from "date-fns/locale";
import { Utensils, Calendar, Clock, Bell, BookOpen, Megaphone, ChevronRight, Music, LogIn } from "lucide-react";
import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { prisma } from "@/lib/db";
import { NoticeRollingBanner } from "@/components/notice-rolling-banner";
import { RealtimeClock } from "@/components/dashboard-widgets";
import { WeatherWidget } from "@/components/weather-widget";
import { getUserGrade } from "@/lib/grade-utils";
import { NotificationBadge } from "@/components/layout/notification-badge";

import { MealViewTracker } from "@/components/meal-view-tracker";

export default async function Home() {
    const today = new Date();
    const currentHour = today.getHours();
    const formattedDate = format(today, "yyyyMMdd");

    const user = await getCurrentUser();

    let grade = "1";
    let classNum = "1";

    // Only set grade/class if user exists
    if (user) {
        const calculatedGrade = await getUserGrade(user.gisu ?? null);
        if (calculatedGrade) {
            grade = calculatedGrade;
        } else if (user.studentId && user.studentId.length >= 3) {
            // Fallback to studentId parsing if no gisu or mapping found
            grade = user.studentId.substring(0, 1);
        }

        if (user.studentId && user.studentId.length >= 3) {
            classNum = user.studentId.substring(1, 2);
        }
    }

    // Fetch Data (Parallel)
    // Skip timetable fetch if no user
    const mealsPromise = getMeals(formattedDate);
    const timetablePromise = user ? getTimetable(formattedDate, grade, classNum) : Promise.resolve([]);
    const noticesPromise = prisma.notice.findMany({
        orderBy: { createdAt: 'desc' },
        where: {
            OR: [
                { expiresAt: { gt: new Date() } },
                { expiresAt: null }
            ]
        },
        take: 5
    });

    const dDayPromise = user ? prisma.personalEvent.findFirst({
        where: { userId: user.id, isPrimary: true },
        orderBy: { targetDate: 'asc' }
    }) : Promise.resolve(null);

    const academicPromise = prisma.schedule.findFirst({
        where: { category: 'ACADEMIC', startDate: { gte: new Date() } },
        orderBy: { startDate: 'asc' }
    });

    const [meals, timetable, notices, personalDDay, academicDDay] = await Promise.all([
        mealsPromise,
        timetablePromise,
        noticesPromise,
        dDayPromise,
        academicPromise
    ]);

    // D-Day Logic
    let dDayTitle = "일정 없음";
    let dDayCount = "-";
    let dDayText = "";
    let dDayPrefix = "까지";

    if (personalDDay) {
        dDayTitle = personalDDay.title;
        const diff = differenceInDays(personalDDay.targetDate, today);
        dDayCount = diff === 0 ? "D-Day" : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
        dDayText = diff === 0 ? "오늘입니다!" : diff > 0 ? "남았습니다." : "지났습니다.";
        dDayPrefix = diff >= 0 ? "까지" : "부터";
    } else if (academicDDay) {
        dDayTitle = academicDDay.title;
        const diff = differenceInDays(academicDDay.startDate, today);
        dDayCount = diff === 0 ? "D-Day" : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`;
        dDayText = diff === 0 ? "오늘입니다!" : diff > 0 ? "남았습니다." : "지났습니다.";
        dDayPrefix = diff >= 0 ? "까지" : "부터";
    }

    // Meal Logic
    const cleanMealName = (name: string) => {
        return name.replace(/\([^)]*\)/g, '').replace(/<br\/>/g, '\n').trim();
    };

    const breakfast = meals.find(m => m.MMEAL_SC_NM === "조식");
    const lunch = meals.find(m => m.MMEAL_SC_NM === "중식");
    const dinner = meals.find(m => m.MMEAL_SC_NM === "석식");

    // Determine Target Meal
    let targetMealTitle = "오늘의 중식";
    let targetMealData = lunch;

    if (currentHour >= 14) {
        targetMealTitle = "오늘의 석식";
        targetMealData = dinner;
    } else if (currentHour < 8) {
        targetMealTitle = "오늘의 조식";
        targetMealData = breakfast;
    }

    return (
        <div className="p-4 md:p-6 max-w-5xl mx-auto">
            <MealViewTracker />
            {/* Header */}
            <header className="flex items-center justify-between mb-6">
                <div>
                    <h1 className="text-xl font-bold text-indigo-600 dark:text-indigo-400">GSHS.app</h1>
                    <div className="text-xs text-slate-600 dark:text-slate-600 flex items-center gap-2 mt-1">
                        <RealtimeClock compact />
                        {user && (
                            <>
                                <span className="h-3 w-px bg-slate-300 dark:bg-slate-700" />
                                <span>{grade}학년 {classNum}반</span>
                            </>
                        )}
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <WeatherWidget />
                    <Link href="/notifications" className="p-2 rounded-full hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors cursor-pointer relative">
                        <Bell className="w-5 h-5" />
                        <NotificationBadge className="w-2.5 h-2.5 top-2 right-2 border-slate-50 dark:border-slate-900" />
                    </Link>
                </div>
            </header>

            {/* Main Grid (2 Columns) */}
            <main className="grid grid-cols-1 md:grid-cols-2 gap-4">

                {/* Left Column */}
                <div className="flex flex-col gap-4">
                    {/* Welcome & D-Day */}
                    <div className="glass-card p-6 relative overflow-hidden flex items-center justify-between gap-4 group">
                        <div className="absolute inset-0 bg-gradient-to-br from-indigo-500/5 to-purple-500/5 transition-all group-hover:scale-105" />

                        {user ? (
                            <>
                                <div className="relative z-10">
                                    <h2 className="text-xl font-bold mb-1 text-slate-900 dark:text-white">
                                        안녕하세요, {user.name}님!
                                    </h2>
                                    <p className="text-slate-600 dark:text-slate-400 text-xs">
                                        <span className="font-bold text-indigo-600 dark:text-indigo-400">{dDayTitle}</span>{dDayPrefix} <span className="text-rose-600 dark:text-rose-400 font-bold">{dDayCount}</span> {dDayText}
                                    </p>
                                </div>
                                <div className="relative z-10 w-12 h-12 rounded-full bg-indigo-100 dark:bg-indigo-500/20 flex items-center justify-center text-indigo-600 dark:text-indigo-400 ring-1 ring-indigo-300 dark:ring-indigo-500/30">
                                    <Calendar className="w-6 h-6" />
                                </div>
                            </>
                        ) : (
                            <div className="relative z-10 w-full flex flex-col items-center text-center py-2">
                                <h2 className="text-lg font-bold mb-2 text-slate-900 dark:text-white">로그인이 필요합니다</h2>
                                <p className="text-xs text-slate-600 dark:text-slate-400 mb-4">개인화된 서비스를 이용하려면 로그인하세요.</p>
                                <Link href="/login" className="btn-primary text-sm py-2 px-6">
                                    <LogIn className="w-4 h-4" />
                                    로그인 하러가기
                                </Link>
                            </div>
                        )}
                    </div>

                    {/* Timetable */}
                    <div className="glass-card glass-card-hover p-5 flex flex-col min-h-[180px] relative overflow-hidden group">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                                오늘의 시간표
                            </h3>
                            {user && <Link href="/timetable"><ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-emerald-400 transition-colors" /></Link>}                 </div>

                        {user ? (
                            <Link href="/timetable" className="flex-1 grid grid-cols-3 gap-3">
                                {timetable.length > 0 ? timetable.slice(0, 6).map((t, i) => (
                                    <div key={i} className="flex flex-col items-center justify-center p-2 rounded-2xl bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 hover:bg-slate-200 dark:hover:bg-white/10 transition-colors">
                                        <div className="text-[10px] text-slate-600 dark:text-slate-400 font-bold mb-1">{t.PERIO}교시</div>
                                        <div className="text-xs font-bold text-slate-800 dark:text-slate-300 text-center line-clamp-1 break-all px-1">
                                            {t.ITRT_CNTNT}
                                        </div>
                                    </div>
                                )) : (
                                    <div className="col-span-full flex items-center justify-center text-xs text-slate-500">
                                        수업 정보 없음
                                    </div>
                                )}
                            </Link>
                        ) : (
                            <div className="flex-1 flex flex-col items-center justify-center text-slate-500 gap-2 bg-white/5 rounded-2xl border border-white/5">
                                <Clock className="w-8 h-8 opacity-20" />
                                <span className="text-xs">로그인 후 내 시간표를 확인하세요</span>
                            </div>
                        )}
                    </div>

                    {/* Notices (Compact) */}
                    <div className="glass-card p-5 flex flex-col gap-2">
                        <NoticeRollingBanner notices={notices} />
                    </div>
                </div>

                {/* Right Column */}
                <div className="flex flex-col gap-4">
                    {/* Meals (Main Feature) */}
                    <Link href="/meals" className="glass-card glass-card-hover p-6 flex flex-col flex-1 group">
                        <div className="flex items-center justify-between mb-4">
                            <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                                <Utensils className="w-4 h-4 text-orange-500 dark:text-orange-400" />
                                {targetMealTitle}
                            </h3>
                            <ChevronRight className="w-4 h-4 text-slate-500 group-hover:text-orange-400 transition-colors" />
                        </div>

                        <div className="flex-1 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/5 rounded-2xl p-4 flex items-center justify-center">
                            <p className="text-slate-800 dark:text-slate-300 whitespace-pre-wrap text-center leading-loose font-medium text-sm">
                                {targetMealData ? cleanMealName(targetMealData.DDISH_NM) : "급식 정보가 없습니다."}
                            </p>
                        </div>

                        <div className="mt-4 flex gap-2">
                            <span className={`flex-1 py-2 text-center rounded-xl text-xs font-bold transition-colors ${targetMealTitle === '오늘의 조식' ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-300 dark:border-orange-500/20' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-white/5'}`}>조식</span>
                            <span className={`flex-1 py-2 text-center rounded-xl text-xs font-bold transition-colors ${targetMealTitle === '오늘의 중식' ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-300 dark:border-orange-500/20' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-white/5'}`}>중식</span>
                            <span className={`flex-1 py-2 text-center rounded-xl text-xs font-bold transition-colors ${targetMealTitle === '오늘의 석식' ? 'bg-orange-100 dark:bg-orange-500/20 text-orange-600 dark:text-orange-400 border border-orange-300 dark:border-orange-500/20' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-slate-500 border border-slate-200 dark:border-white/5'}`}>석식</span>
                        </div>
                    </Link>

                    {/* Quick Links */}
                    <div className="grid grid-cols-3 gap-4">
                        <Link href="/songs" className="glass-card glass-card-hover p-4 flex flex-col items-center justify-center gap-2 text-center">
                            <div className="w-10 h-10 rounded-full bg-rose-100 dark:bg-rose-500/20 border border-rose-300 dark:border-rose-500/20 flex items-center justify-center text-rose-600 dark:text-rose-400">
                                <Music className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-300">기상곡</span>
                        </Link>
                        <Link href="/calendar" className="glass-card glass-card-hover p-4 flex flex-col items-center justify-center gap-2 text-center">
                            <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-500/20 border border-emerald-300 dark:border-emerald-500/20 flex items-center justify-center text-emerald-600 dark:text-emerald-400">
                                <Calendar className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-300">학사일정</span>
                        </Link>
                        <Link href="/links" className="glass-card glass-card-hover p-4 flex flex-col items-center justify-center gap-2 text-center">
                            <div className="w-10 h-10 rounded-full bg-sky-100 dark:bg-sky-500/20 border border-sky-300 dark:border-sky-500/20 flex items-center justify-center text-sky-600 dark:text-sky-400">
                                <BookOpen className="w-5 h-5" />
                            </div>
                            <span className="text-xs font-bold text-slate-800 dark:text-slate-300">바로가기</span>
                        </Link>
                    </div>
                </div>

            </main>
        </div>
    );
}
