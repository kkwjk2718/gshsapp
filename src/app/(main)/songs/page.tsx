import { Metadata } from "next";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getKSTDate } from "@/lib/date-utils";
import { resolveUserGrade } from "@/lib/grade-utils";
import { getSongCycleContext } from "@/lib/song-cycle";
import {
  SONG_RULE_DAYS,
  formatAllowedGradeLabel,
  parseAllowedGrades,
} from "@/lib/song-rules";
import { getCurrentUser } from "@/lib/session";
import { canAccessCoreMemberFeatures } from "@/lib/user-roles";

import { getCurrentCycleSongs, getTodayMorningSongs } from "./actions";
import { SongRequestForm } from "./request-form";
import { SongList } from "./song-list";

export const metadata: Metadata = {
  title: "기상곡 신청",
  description: "아침 기상곡을 신청하고 현재 배치 현황을 확인하세요.",
};

export default async function SongsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessCoreMemberFeatures(user.role)) redirect("/");

  const cycleContext = getSongCycleContext();
  const todaySongs = await getTodayMorningSongs();
  const currentCycleSongs = await getCurrentCycleSongs();

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
  });

  let isAllowedGrade = true;
  const todayDay = getKSTDate().getDay();
  const songRules = await prisma.songRule.findMany({
    orderBy: { dayOfWeek: "asc" },
  });
  const ruleByDay = new Map(songRules.map((rule) => [rule.dayOfWeek, rule.allowedGrade]));
  const todayAllowedGrades = ruleByDay.get(todayDay) ?? "ALL";
  const weeklyRules = SONG_RULE_DAYS.map((day) => ({
    ...day,
    label: formatAllowedGradeLabel(ruleByDay.get(day.dayOfWeek) ?? "ALL"),
    isToday: day.dayOfWeek === todayDay,
  }));

  if (dbUser && dbUser.role !== "ADMIN") {
    const rule = await prisma.songRule.findFirst({
      where: { dayOfWeek: todayDay },
    });

    if (rule && rule.allowedGrade !== "ALL") {
      const grade = await resolveUserGrade(dbUser.studentId, dbUser.gisu);
      const allowedGrades = parseAllowedGrades(rule.allowedGrade);
      isAllowedGrade = !!grade && allowedGrades.includes(grade);
    }
  }

  const currentQueueTitle =
    cycleContext.requestCycleDateKey === cycleContext.todayDateKey
      ? "오늘 기상곡 신청 현황"
      : "내일 기상곡 신청 현황";

  return (
    <div className="mobile-page mobile-safe-bottom space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
            기상곡 신청
          </h1>
          <p style={{ color: "var(--muted)" }}>
            아침 기상곡을 신청하고 다른 학생들이 신청한 곡을 확인하세요.
          </p>
        </div>
      </div>

      <SongRequestForm
        isAllowedGrade={isAllowedGrade}
        isBreakTime={cycleContext.isBreakTime}
        todayAllowedGradesLabel={formatAllowedGradeLabel(todayAllowedGrades)}
        weeklyRules={weeklyRules}
      />

      <div className="space-y-8">
        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
              오늘 아침에 나온 기상곡
            </h2>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}
            >
              최종 6곡
            </span>
          </div>
          <SongList
            songs={todaySongs}
            currentUser={user}
            emptyMessage="아직 확정된 기상곡이 없습니다."
          />
        </section>

        <section className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
              {currentQueueTitle}
            </h2>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}
            >
              실시간 배치
            </span>
          </div>
          <SongList
            songs={currentCycleSongs}
            currentUser={user}
            emptyMessage="현재 회차에 신청된 곡이 없습니다."
            showOverflow
            overflowDesktopOnly
            overflowTitle="추가 신청곡"
          />
        </section>
      </div>
    </div>
  );
}
