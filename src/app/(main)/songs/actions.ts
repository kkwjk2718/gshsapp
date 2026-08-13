"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";

import { prisma } from "@/lib/db";
import { getKSTDate, isBreakTime } from "@/lib/date-utils";
import { getUserGrade } from "@/lib/grade-utils";
import { logAction } from "@/lib/logger";
import { parseTrustedProxyHops, resolveTrustedClientAddress } from "@/lib/security/client-address";
import { BoundedRateLimiter } from "@/lib/security/rate-limit";
import { canonicalizeYouTubeUrl } from "@/lib/security/youtube-url";
import { getCurrentUser } from "@/lib/session";
import { canAccessCoreMemberFeatures } from "@/lib/user-roles";
import { readBoundedJsonResponse } from "@/lib/outbound-response";
import { enforceSongRequestLifecycle } from "@/lib/submission-lifecycle";
import {
  SONG_DAILY_CAP,
  SONG_PENDING_CAP,
  consumeSongSubmissionQuota,
  validateSongTitle,
} from "@/lib/security/submission-controls";

const YOUTUBE_OEMBED_TIMEOUT_MS = 3_000;
const YOUTUBE_OEMBED_MAX_RESPONSE_BYTES = 32 * 1024;
const TITLE_RESOLUTION_WINDOW_MS = 60_000;
const TITLE_RESOLUTION_LIMIT = 5;
const MAX_TITLE_RESOLUTION_KEYS = 1_024;

const titleResolutionPrincipalLimiter = new BoundedRateLimiter({
  capacity: TITLE_RESOLUTION_LIMIT, refillTokens: TITLE_RESOLUTION_LIMIT,
  refillIntervalMs: TITLE_RESOLUTION_WINDOW_MS, idleTtlMs: 10 * TITLE_RESOLUTION_WINDOW_MS,
  maxKeys: MAX_TITLE_RESOLUTION_KEYS,
});
const titleResolutionNetworkLimiter = new BoundedRateLimiter({
  capacity: TITLE_RESOLUTION_LIMIT, refillTokens: TITLE_RESOLUTION_LIMIT,
  refillIntervalMs: TITLE_RESOLUTION_WINDOW_MS, idleTtlMs: 10 * TITLE_RESOLUTION_WINDOW_MS,
  maxKeys: MAX_TITLE_RESOLUTION_KEYS,
});

function consumeTitleResolutionQuota(principalId: string, ip: string) {
  if (!titleResolutionPrincipalLimiter.consume(`principal:${principalId}`).allowed ||
      !titleResolutionNetworkLimiter.consume(`ip:${ip}`).allowed) {
    throw new Error("Too many YouTube title resolution attempts. Please try again later.");
  }
}

async function getClientIp() {
  const requestHeaders = await headers();
  return resolveTrustedClientAddress(
    { directAddress: null, forwardedFor: requestHeaders.get("x-forwarded-for") },
    { trustedProxyHops: parseTrustedProxyHops(process.env.TRUSTED_PROXY_HOPS) },
  ) ?? "unknown";
}

async function resolveVideoTitle(
  youtubeUrl: string,
  rawVideoTitle: string | null,
  principalId: string,
) {
  const trimmedTitle = rawVideoTitle?.trim() ?? "";
  if (trimmedTitle) {
    return validateSongTitle(trimmedTitle);
  }

  consumeTitleResolutionQuota(principalId, await getClientIp());

  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(youtubeUrl)}&format=json`,
      {
        headers: { Accept: "application/json" },
        signal: AbortSignal.timeout(YOUTUBE_OEMBED_TIMEOUT_MS),
      },
    );

    if (response.ok) {
      const data = await readBoundedJsonResponse<unknown>(response, {
        maxBytes: YOUTUBE_OEMBED_MAX_RESPONSE_BYTES,
      });
      const title = typeof data === "object" && data !== null && !Array.isArray(data)
        ? (data as { title?: unknown }).title
        : undefined;
      if (
        typeof title === "string" &&
        title.trim()
      ) {
        return validateSongTitle(title);
      }
    }
  } catch {
    // Fall back to the default title when YouTube metadata is slow or unavailable.
  }

  return "신청곡";
}

export async function requestSong(formData: FormData) {
  const user = await getCurrentUser();
  if (!user?.id || !canAccessCoreMemberFeatures(user.role)) {
    throw new Error("Unauthorized");
  }
  consumeSongSubmissionQuota(user.id);

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

  await prisma.$transaction(async (tx) => {
    await enforceSongRequestLifecycle(tx);
    const since = new Date(Date.now() - 86_400_000);
    const [dailyCount, pendingCount] = await Promise.all([
      tx.songRequest.count({ where: { requesterId: user.id, createdAt: { gte: since } } }),
      tx.songRequest.count({ where: { requesterId: user.id, status: "PENDING" } }),
    ]);
    if (dailyCount >= SONG_DAILY_CAP || pendingCount >= SONG_PENDING_CAP) {
      throw new Error("Song request quota exceeded");
    }
    await tx.songRequest.create({
      data: {
        requesterId: user.id,
        youtubeUrl,
        videoTitle,
        status: "PENDING",
        priorityScore,
        isAnonymous,
      },
    });
  });

  await logAction("SONG_REQUEST", { title: videoTitle, url: youtubeUrl });

  revalidatePath("/songs");
}
