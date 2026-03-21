"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { getSongTimeRanges, getKSTDate, isBreakTime } from "@/lib/date-utils";
import { getUserGrade } from "@/lib/grade-utils";
import { logAction } from "@/lib/logger";
import { getCurrentUser } from "@/lib/session";

const YOUTUBE_OEMBED_TIMEOUT_MS = 3_000;

async function resolveVideoTitle(youtubeUrl: string, rawVideoTitle: string | null) {
  const trimmedTitle = rawVideoTitle?.trim() ?? "";
  if (trimmedTitle) {
    return trimmedTitle;
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), YOUTUBE_OEMBED_TIMEOUT_MS);

  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`,
      { signal: controller.signal },
    );

    if (response.ok) {
      const data = (await response.json()) as { title?: string };
      if (typeof data.title === "string" && data.title.trim()) {
        return data.title.trim();
      }
    }
  } catch {
    // Fall back to the default title when YouTube metadata is slow or unavailable.
  } finally {
    clearTimeout(timeoutId);
  }

  return "신청곡";
}

export async function requestSong(formData: FormData) {
  if (isBreakTime()) {
    throw new Error("지금은 기상곡 신청 시간이 아닙니다. (신청 가능: 07:00 ~ 익일 05:00)");
  }

  const youtubeUrl = formData.get("youtubeUrl") as string;
  const videoTitle = await resolveVideoTitle(
    youtubeUrl,
    formData.get("videoTitle") as string | null,
  );

  const user = await getCurrentUser();
  if (!user || !user.id) throw new Error("Unauthorized");

  const dbUser = await prisma.user.findUnique({ where: { id: user.id } });
  if (!dbUser) throw new Error("User not found");

  if (dbUser.banExpiresAt && dbUser.banExpiresAt > new Date()) {
    return;
  }

  if (dbUser.role !== "ADMIN") {
    const todayDay = getKSTDate().getDay();
    const rule = await prisma.songRule.findFirst({
      where: { dayOfWeek: todayDay },
    });

    if (rule && rule.allowedGrade !== "ALL") {
      let grade = await getUserGrade(dbUser.gisu);

      if (!grade && dbUser.studentId && dbUser.studentId.length >= 3) {
        grade = dbUser.studentId.substring(0, 1);
      }

      const allowedGrades = rule.allowedGrade
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);

      if (!grade || !allowedGrades.includes(grade)) {
        throw new Error(`오늘은 ${rule.allowedGrade}학년만 신청할 수 있습니다.`);
      }
    }
  }

  let priorityScore = 10;
  if (dbUser.role === "ADMIN") priorityScore = 999;
  else if (dbUser.role === "BROADCAST") priorityScore = 50;

  const isAnonymous = formData.get("isAnonymous") === "on";

  await prisma.songRequest.create({
    data: {
      requesterId: user.id,
      youtubeUrl,
      videoTitle,
      status: "PENDING",
      priorityScore,
      isAnonymous,
    },
  });

  await logAction("SONG_REQUEST", { title: videoTitle, url: youtubeUrl });

  revalidatePath("/songs");
}

export async function getTodayMorningSongs() {
  const { todayMorning } = getSongTimeRanges();

  return await prisma.songRequest.findMany({
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
    include: { requester: true },
  });
}

export async function getNextMorningSongs() {
  const { todayMorning, nextMorning } = getSongTimeRanges();
  const now = getKSTDate();
  const currentHour = now.getHours();
  const targetRange = currentHour < 7 ? todayMorning : nextMorning;

  return await prisma.songRequest.findMany({
    where: {
      createdAt: {
        gte: targetRange.start,
        lt: targetRange.end,
      },
    },
    orderBy: [{ priorityScore: "desc" }, { createdAt: "asc" }],
    include: { requester: true },
  });
}
