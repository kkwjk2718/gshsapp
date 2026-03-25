import { NextResponse } from "next/server";
import { format, differenceInDays } from "date-fns";
import { prisma } from "@/lib/db";
import { getTimetable } from "@/lib/neis";
import { getUserGrade } from "@/lib/grade-utils";
import { getKSTDate } from "@/lib/date-utils";
import { getCalendarSchedules } from "@/lib/public-content";
import {
  anonymousHomePersonalization,
  type HomeDdayPayload,
  type HomePersonalizationPayload,
} from "@/lib/user-state";
import { canAccessCoreMemberFeatures } from "@/lib/user-roles";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
};

function getExternalSchedulePriority(
  schedule: Awaited<ReturnType<typeof getCalendarSchedules>>[number],
) {
  return "isExternal" in schedule && schedule.isExternal ? 1 : 0;
}

function formatDday(title: string, targetDate: Date, today: Date): HomeDdayPayload {
  const diff = differenceInDays(targetDate, today);

  return {
    title,
    count: diff === 0 ? "D-Day" : diff > 0 ? `D-${diff}` : `D+${Math.abs(diff)}`,
    text: diff === 0 ? "오늘입니다." : diff > 0 ? "남았습니다." : "지났습니다.",
    prefix: diff >= 0 ? "까지" : "부터",
  };
}

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(anonymousHomePersonalization, { headers: noStoreHeaders });
  }

  const today = getKSTDate();
  const dateStr = format(today, "yyyyMMdd");

  let grade: string | null = null;
  let classNum: string | null = null;

  const mappedGrade = await getUserGrade(user.gisu ?? null);
  if (mappedGrade) {
    grade = mappedGrade;
  } else if (user.studentId && user.studentId.length >= 2) {
    grade = user.studentId.substring(0, 1);
  }

  if (user.studentId && user.studentId.length >= 2) {
    classNum = user.studentId.substring(1, 2);
  }

  const [personalDDayEvent, todayTimetable, todaySchedules] = await Promise.all([
    prisma.personalEvent.findFirst({
      where: { userId: user.id, isPrimary: true },
      orderBy: { targetDate: "asc" },
    }),
    canAccessCoreMemberFeatures(user.role) && grade && classNum
      ? getTimetable(dateStr, grade, classNum).catch(() => [])
      : Promise.resolve([]),
    getCalendarSchedules()
      .then((schedules) =>
        schedules
          .filter((schedule) => {
            const startDate = new Date(schedule.startDate);
            const endDate = new Date(schedule.endDate);
            return startDate <= today && endDate >= today;
          })
          .sort((left, right) => {
            return getExternalSchedulePriority(left) - getExternalSchedulePriority(right);
          }),
      )
      .catch(() => []),
  ]);

  const todayScheduleSummary =
    todaySchedules.length > 0
      ? todaySchedules.length === 1
        ? `${todaySchedules[0].title} 일정이 있습니다.`
        : `${todaySchedules[0].title} 외 ${todaySchedules.length - 1}건 일정이 있습니다.`
      : null;

  const payload: HomePersonalizationPayload = {
    authenticated: true,
    role: user.role ?? null,
    name: user.name ?? null,
    studentId: user.studentId ?? null,
    grade,
    classNum,
    personalDDay: personalDDayEvent
      ? formatDday(personalDDayEvent.title, personalDDayEvent.targetDate, today)
      : null,
    todayScheduleSummary,
    todayTimetable: todayTimetable.map((item) => ({
      period: item.PERIO,
      content: item.ITRT_CNTNT,
    })),
  };

  return NextResponse.json(payload, { headers: noStoreHeaders });
}
