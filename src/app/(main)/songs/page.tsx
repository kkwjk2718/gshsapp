import { Metadata } from "next";
import { redirect } from "next/navigation";

import { prisma } from "@/lib/db";
import { getKSTDate, getSongTimeRanges } from "@/lib/date-utils";
import { getUserGrade } from "@/lib/grade-utils";
import { canonicalizeYouTubeUrl } from "@/lib/security/youtube-url";
import { getCurrentUser } from "@/lib/session";
import {
  SONG_RULE_DAYS,
  formatAllowedGradeLabel,
  parseAllowedGrades,
} from "@/lib/song-rules";
import { canAccessCoreMemberFeatures } from "@/lib/user-roles";
import { SONG_DAILY_READ_CAP } from "@/lib/security/submission-controls";

import { SongRequestForm } from "./request-form";
import { SongList, type SongListItem } from "./song-list";

const SONG_REQUEST_SELECT = {
  id: true,
  videoTitle: true,
  youtubeUrl: true,
  status: true,
  createdAt: true,
  isAnonymous: true,
  requester: {
    select: {
      name: true,
      studentId: true,
    },
  },
} as const;

type SongRequestRow = {
  id: string;
  videoTitle: string;
  youtubeUrl: string;
  status: string;
  createdAt: Date;
  isAnonymous: boolean;
  requester: {
    name: string;
    studentId: string | null;
  };
};

function toSongListItem(row: SongRequestRow): SongListItem | null {
  if (!(["PENDING", "APPROVED", "PLAYED"] as const).includes(row.status as SongListItem["status"])) {
    return null;
  }

  try {
    return {
      id: row.id,
      videoTitle: row.videoTitle,
      youtubeUrl: canonicalizeYouTubeUrl(row.youtubeUrl),
      status: row.status as SongListItem["status"],
      createdAt: row.createdAt.toISOString(),
      requester: row.isAnonymous
        ? null
        : {
            name: row.requester.name,
            studentId: row.requester.studentId,
          },
    };
  } catch {
    return null;
  }
}

function toSongList(rows: SongRequestRow[]) {
  return rows.map(toSongListItem).filter((song): song is SongListItem => song !== null);
}

export const metadata: Metadata = {
  title: "기상곡 신청",
  description: "아침 기상곡을 신청하고 다른 학생들이 신청한 곡을 확인하세요.",
};

export default async function SongsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessCoreMemberFeatures(user.role)) redirect("/");

  const todayDay = getKSTDate().getDay();
  const { todayMorning, nextMorning } = getSongTimeRanges();
  const currentHour = getKSTDate().getHours();
  const nextTargetRange = currentHour < 7 ? todayMorning : nextMorning;

  const [todaySongRows, nextSongRows, dbUser, songRules] = await Promise.all([
    prisma.songRequest.findMany({
      where: {
        createdAt: {
          gte: todayMorning.start,
          lt: todayMorning.end,
        },
        status: {
          in: ["APPROVED", "PLAYED"],
        },
      },
      orderBy: { priorityScore: "desc" },
      take: SONG_DAILY_READ_CAP,
      select: SONG_REQUEST_SELECT,
    }),
    prisma.songRequest.findMany({
      where: {
        createdAt: {
          gte: nextTargetRange.start,
          lt: nextTargetRange.end,
        },
        status: {
          in: ["PENDING", "APPROVED", "PLAYED"],
        },
      },
      orderBy: [{ priorityScore: "desc" }, { createdAt: "asc" }],
      take: SONG_DAILY_READ_CAP,
      select: SONG_REQUEST_SELECT,
    }),
    prisma.user.findUnique({
      where: { id: user.id },
      select: {
        role: true,
        gisu: true,
        studentId: true,
      },
    }),
    prisma.songRule.findMany({
      orderBy: { dayOfWeek: "asc" },
      select: {
        dayOfWeek: true,
        allowedGrade: true,
      },
    }),
  ]);

  const todaySongs = toSongList(todaySongRows);
  const nextSongs = toSongList(nextSongRows);
  let isAllowedGrade = true;
  const ruleByDay = new Map(songRules.map((rule) => [rule.dayOfWeek, rule.allowedGrade]));
  const todayAllowedGrades = ruleByDay.get(todayDay) ?? "ALL";
  const weeklyRules = SONG_RULE_DAYS.map((day) => ({
    ...day,
    label: formatAllowedGradeLabel(ruleByDay.get(day.dayOfWeek) ?? "ALL"),
    isToday: day.dayOfWeek === todayDay,
  }));

  if (dbUser && dbUser.role !== "ADMIN") {
    const allowedGrade = ruleByDay.get(todayDay);

    if (allowedGrade && allowedGrade !== "ALL") {
      let grade = await getUserGrade(dbUser.gisu);

      if (!grade && dbUser.studentId && dbUser.studentId.length >= 3) {
        grade = dbUser.studentId.substring(0, 1);
      }

      const allowedGrades = parseAllowedGrades(allowedGrade);

      isAllowedGrade = !!grade && allowedGrades.includes(grade);
    }
  }

  return (
    <div className="mobile-page mobile-safe-bottom space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>
            기상곡 신청
          </h1>
          <p style={{ color: "var(--muted)" }}>
            금일 07:00 ~ 익일 05:00까지 신청 가능합니다.
          </p>
        </div>
      </div>

      <SongRequestForm
        isAllowedGrade={isAllowedGrade}
        todayAllowedGradesLabel={formatAllowedGradeLabel(todayAllowedGrades)}
        weeklyRules={weeklyRules}
      />

      <div className="space-y-8">
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
              오늘 아침 나온 기상곡
            </h2>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}
            >
              승인됨
            </span>
          </div>
          {todaySongs.length > 0 ? (
            <SongList songs={todaySongs} emptyMessage="오늘 나온 기상곡 내역이 없습니다." />
          ) : (
            <div
              className="rounded-2xl border border-dashed p-8 text-center"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--muted)" }}
            >
              오늘 선정된 기상곡이 없거나 아직 업데이트되지 않았습니다.
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
              내일 기상곡 신청 현황
            </h2>
            <span
              className="rounded-full px-2 py-0.5 text-xs font-medium"
              style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}
            >
              진행중
            </span>
          </div>
          <SongList
            songs={nextSongs}
            emptyMessage="아직 신청된 노래가 없습니다. 첫 번째 주인공이 되어보세요! 🎵"
          />
        </div>
      </div>
    </div>
  );
}
