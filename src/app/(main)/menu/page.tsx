import Link from "next/link";
import { BookOpen, Calendar, Clock, Music, User, Utensils } from "lucide-react";

import { APP_SEMVER_TAG } from "@/lib/app-version";
import { getCurrentUser } from "@/lib/session";
import { canAccessCoreMemberFeatures } from "@/lib/user-roles";

export default async function MenuPage() {
  const user = await getCurrentUser();
  const menuItems = [
    {
      name: "내 정보",
      href: "/me",
      icon: User,
      color: "text-indigo-600 dark:text-indigo-400",
      bg: "bg-indigo-100 dark:bg-indigo-900/30",
    },
    {
      name: "급식",
      href: "/meals",
      icon: Utensils,
      color: "text-orange-600 dark:text-orange-400",
      bg: "bg-orange-100 dark:bg-orange-900/30",
    },
    {
      name: "시간표",
      href: "/timetable",
      icon: Clock,
      color: "text-emerald-600 dark:text-emerald-400",
      bg: "bg-emerald-100 dark:bg-emerald-900/30",
    },
    {
      name: "기상곡",
      href: "/songs",
      icon: Music,
      color: "text-rose-600 dark:text-rose-400",
      bg: "bg-rose-100 dark:bg-rose-900/30",
    },
    {
      name: "학사일정",
      href: "/calendar",
      icon: Calendar,
      color: "text-blue-600 dark:text-blue-400",
      bg: "bg-blue-100 dark:bg-blue-900/30",
    },
    {
      name: "링크모음",
      href: "/links",
      icon: BookOpen,
      color: "text-violet-600 dark:text-violet-400",
      bg: "bg-violet-100 dark:bg-violet-900/30",
    },
  ];

  const visibleMenuItems = canAccessCoreMemberFeatures(user?.role)
    ? menuItems
    : menuItems.filter((item) => !["/timetable", "/songs", "/links"].includes(item.href));

  return (
    <div className="mobile-page mobile-safe-bottom space-y-6">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">전체 메뉴</h1>

      <div className="grid grid-cols-2 gap-4">
        {visibleMenuItems.map((item) => (
          <Link
            href={item.href}
            key={item.name}
            className="glass flex aspect-square flex-col items-center justify-center gap-3 rounded-2xl p-4 transition-transform hover:scale-[1.02]"
          >
            <div className={`rounded-full p-3 ${item.bg} ${item.color}`}>
              <item.icon className="h-6 w-6" />
            </div>
            <span className="font-medium">{item.name}</span>
          </Link>
        ))}
      </div>

      <div className="glass rounded-2xl p-4">
        <h2 className="mb-2 font-semibold">서비스 정보</h2>
        <p className="text-xs text-slate-500">
          GSHS.app {APP_SEMVER_TAG}
          <br />
          경남과학고등학교 정보부 · IEUM
        </p>
      </div>
    </div>
  );
}
