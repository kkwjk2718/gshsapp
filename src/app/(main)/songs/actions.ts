"use server"

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { getUserGrade } from "@/lib/grade-utils";
import { logAction } from "@/lib/logger";
import { getSongTimeRanges, isBreakTime } from "@/lib/date-utils";

export async function requestSong(formData: FormData) {
  // 0. Time Restriction Check (05:00 ~ 07:00)
  if (isBreakTime()) {
    throw new Error("지금은 기상곡 신청 시간이 아닙니다. (신청 가능: 07:00 ~ 익일 05:00)");
  }

  const youtubeUrl = formData.get("youtubeUrl") as string;
  const videoTitle = formData.get("videoTitle") as string || "신청곡";

  const user = await getCurrentUser();
  if (!user || !user.id) throw new Error("Unauthorized");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) throw new Error("User not found");

  // 1. Blacklist Check
  if (dbUser.banExpiresAt && dbUser.banExpiresAt > new Date()) {
    return;
  }

  // 2. Quota Check (Skip for Admin)
  if (dbUser.role !== 'ADMIN') {
    const todayDay = new Date().getDay();
    const rule = await prisma.songRule.findFirst({
      where: { dayOfWeek: todayDay }
    });

    if (rule && rule.allowedGrade !== 'ALL') {
      let grade = await getUserGrade(dbUser.gisu);
      if (!grade && dbUser.studentId && dbUser.studentId.length >= 3) {
        grade = dbUser.studentId.substring(0, 1);
      }

      const allowedGrades = rule.allowedGrade.split(",");
      if (!grade || !allowedGrades.includes(grade)) {
        return;
      }
    }
  }

  // 3. Calculate Priority Score
  let priorityScore = 10;
  if (dbUser.role === 'ADMIN') priorityScore = 999;
  else if (dbUser.role === 'BROADCAST') priorityScore = 50;

  const isAnonymous = formData.get("isAnonymous") === "on";

  await prisma.songRequest.create({
    data: {
      requesterId: user.id,
      youtubeUrl,
      videoTitle,
      status: "PENDING",
      priorityScore,
      isAnonymous
    },
  });

  await logAction("SONG_REQUEST", { title: videoTitle, url: youtubeUrl });

  revalidatePath("/songs");
}

export async function getTodayMorningSongs() {
  const { todayMorning } = getSongTimeRanges();

  // 오늘 아침 기상곡 (어제 07:00 ~ 오늘 05:00 신청분 중 APPROVED/PLAYED)
  return await prisma.songRequest.findMany({
    where: {
      createdAt: {
        gte: todayMorning.start,
        lt: todayMorning.end
      },
      status: {
        in: ["APPROVED", "PLAYED"]
      }
    },
    orderBy: { priorityScore: 'desc' },
    include: { requester: true },
  });
}

export async function getNextMorningSongs() {
  const { todayMorning, nextMorning } = getSongTimeRanges();
  const dateUtils = await import("@/lib/date-utils");
  const now = dateUtils.getKSTDate();
  const currentHour = now.getHours();

  // If currently before 07:00, users are still viewing/applying for "Today's" playlist (or it's just closed).
  // In this case, "Application Status" should show the songs for "Today Morning" so users can see their pending/rejected status.
  // After 07:00, it switches to "Next Morning".
  const targetRange = currentHour < 7 ? todayMorning : nextMorning;

  return await prisma.songRequest.findMany({
    where: {
      createdAt: {
        gte: targetRange.start,
        lt: targetRange.end
      }
    },
    orderBy: [
      { priorityScore: 'desc' },
      { createdAt: 'asc' }
    ],
    include: { requester: true },
  });
}