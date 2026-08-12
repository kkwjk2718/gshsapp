"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { prisma } from "@/lib/db";
import { getKSTDate, isBreakTime } from "@/lib/date-utils";
import { getUserGrade } from "@/lib/grade-utils";
import { logAction } from "@/lib/logger";
import { FixedWindowRateLimiter } from "@/lib/security/fixed-window-rate-limit";
import { resolveTrustedClientIp } from "@/lib/security/trusted-client-ip";
import { canonicalizeYouTubeUrl } from "@/lib/security/youtube-url";
import { getCurrentUser } from "@/lib/session";
import { canAccessCoreMemberFeatures } from "@/lib/user-roles";

const YOUTUBE_OEMBED_TIMEOUT_MS = 3_000;
const TITLE_RESOLUTION_WINDOW_MS = 60_000;
const TITLE_RESOLUTION_LIMIT = 5;
const MAX_TITLE_RESOLUTION_KEYS = 1_024;

const titleResolutionLimiter = new FixedWindowRateLimiter({
  limit: TITLE_RESOLUTION_LIMIT,
  windowMs: TITLE_RESOLUTION_WINDOW_MS,
  maxKeys: MAX_TITLE_RESOLUTION_KEYS,
});

function consumeTitleResolutionQuota(principalId: string, ip: string) {
  if (!titleResolutionLimiter.consume([`principal:${principalId}`, `ip:${ip}`])) {
    throw new Error("Too many YouTube title resolution attempts. Please try again later.");
  }
}

async function getClientIp() {
  const requestHeaders = await headers();
  return resolveTrustedClientIp(requestHeaders, process.env.TRUSTED_CLIENT_IP_HEADER);
}

async function resolveVideoTitle(
  youtubeUrl: string,
  rawVideoTitle: string | null,
  principalId: string,
) {
  const trimmedTitle = rawVideoTitle?.trim() ?? "";
  if (trimmedTitle) {
    return trimmedTitle;
  }

  consumeTitleResolutionQuota(principalId, await getClientIp());

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
  const user = await getCurrentUser();
  if (!user?.id || !canAccessCoreMemberFeatures(user.role)) {
    throw new Error("Unauthorized");
  }

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: {
      id: true,
      role: true,
      gisu: true,
      studentId: true,
      banExpiresAt: true,
    },
  });
  if (!dbUser) throw new Error("Unauthorized");

  if (isBreakTime()) {
    throw new Error("지금은 기상곡 신청 시간이 아닙니다. (신청 가능: 07:00 ~ 익일 05:00)");
  }

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

  const rawYoutubeUrl = formData.get("youtubeUrl");
  if (typeof rawYoutubeUrl !== "string") {
    throw new Error("Invalid YouTube URL.");
  }

  const youtubeUrl = canonicalizeYouTubeUrl(rawYoutubeUrl);
  const rawVideoTitle = formData.get("videoTitle");
  const videoTitle = await resolveVideoTitle(
    youtubeUrl,
    typeof rawVideoTitle === "string" ? rawVideoTitle : null,
    dbUser.id,
  );

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
