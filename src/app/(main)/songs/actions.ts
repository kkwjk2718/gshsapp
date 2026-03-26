"use server";

import { revalidatePath } from "next/cache";

import { prisma } from "@/lib/db";
import { getKSTDate } from "@/lib/date-utils";
import { resolveUserGrade } from "@/lib/grade-utils";
import { logAction } from "@/lib/logger";
import { getSongCycleContext } from "@/lib/song-cycle";
import {
  ensureTodaySongCycleSettled,
  getFinalSongsForCycle,
  getPendingSongsForCycle,
  recalculatePendingSongAssignments,
} from "@/lib/song-queue";
import { encodePreferredSlots } from "@/lib/song-slots";
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
    // Fall back to the default title when YouTube metadata is unavailable.
  } finally {
    clearTimeout(timeoutId);
  }

  return "신청곡";
}

async function assertAllowedGrade(userId: string) {
  const dbUser = await prisma.user.findUnique({ where: { id: userId } });
  if (!dbUser) {
    throw new Error("User not found");
  }

  if (dbUser.banExpiresAt && dbUser.banExpiresAt > new Date()) {
    throw new Error("현재 신청이 제한된 계정입니다.");
  }

  if (dbUser.role === "ADMIN") {
    return dbUser;
  }

  const todayDay = getKSTDate().getDay();
  const rule = await prisma.songRule.findFirst({
    where: { dayOfWeek: todayDay },
  });

  if (!rule || rule.allowedGrade === "ALL") {
    return dbUser;
  }

  const grade = await resolveUserGrade(dbUser.studentId, dbUser.gisu);
  const allowedGrades = rule.allowedGrade
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (!grade || !allowedGrades.includes(grade)) {
    throw new Error(`오늘은 ${rule.allowedGrade}학년만 신청할 수 있습니다.`);
  }

  return dbUser;
}

function getPriorityScore(role: string) {
  if (role === "ADMIN") {
    return 999;
  }

  if (role === "BROADCAST") {
    return 50;
  }

  return 10;
}

export async function requestSong(formData: FormData) {
  const cycleContext = getSongCycleContext();
  if (cycleContext.isBreakTime) {
    throw new Error(
      "지금은 기상곡 신청 시간대가 아닙니다. 신청 가능 시간은 07:00부터 다음날 05:00까지입니다.",
    );
  }

  const youtubeUrl = `${formData.get("youtubeUrl") ?? ""}`.trim();
  if (!youtubeUrl) {
    throw new Error("YouTube URL을 입력해 주세요.");
  }

  const videoTitle = await resolveVideoTitle(
    youtubeUrl,
    formData.get("videoTitle") as string | null,
  );

  const preferredSlotMask: number = encodePreferredSlots(
    formData.getAll("preferredSlots").map((value) => `${value}`),
  );

  const user = await getCurrentUser();
  if (!user?.id) {
    throw new Error("Unauthorized");
  }

  const dbUser = await assertAllowedGrade(user.id);

  await prisma.songRequest.create({
    data: {
      requesterId: user.id,
      youtubeUrl,
      videoTitle,
      preferredSlotMask,
      cycleDateKey: cycleContext.requestCycleDateKey,
      status: "PENDING",
      priorityScore: getPriorityScore(dbUser.role),
      isAnonymous: formData.get("isAnonymous") === "on",
    },
  });

  await recalculatePendingSongAssignments(cycleContext.requestCycleDateKey);
  await logAction("SONG_REQUEST", {
    title: videoTitle,
    url: youtubeUrl,
    cycleDateKey: cycleContext.requestCycleDateKey,
    preferredSlotMask,
  });

  revalidatePath("/songs");
  revalidatePath("/music");
}

export async function getTodayMorningSongs() {
  await ensureTodaySongCycleSettled();
  const { finalCycleDateKey } = getSongCycleContext();
  return getFinalSongsForCycle(finalCycleDateKey);
}

export async function getCurrentCycleSongs() {
  await ensureTodaySongCycleSettled();
  const { requestCycleDateKey } = getSongCycleContext();
  return getPendingSongsForCycle(requestCycleDateKey);
}
