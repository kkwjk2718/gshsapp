import type { Prisma } from "@prisma/client";

import { writeAuditLog } from "@/lib/audit";
import { enforceNotificationLifecycle } from "@/lib/notifications";
import { isCanonicalUuid } from "@/lib/security/public-input";

export const SONG_STATUSES = ["PENDING", "APPROVED", "REJECTED", "PLAYED"] as const;
export type SongStatus = (typeof SONG_STATUSES)[number];

const REJECTION_REASON_MAX_CHARS = 500;
const REJECTION_REASON_MAX_BYTES = 1_000;
const CONTROL = /[\u0000-\u001f\u007f-\u009f\ufeff]/u;
const ALLOWED_TRANSITIONS: Readonly<Record<SongStatus, readonly SongStatus[]>> = {
  PENDING: ["APPROVED", "REJECTED"],
  APPROVED: ["PLAYED"],
  REJECTED: [],
  PLAYED: [],
};

type SongModerationTransaction = Pick<
  Prisma.TransactionClient,
  "songRequest" | "notification" | "auditLog"
>;

export type SongModerationDb = {
  $transaction<T>(callback: (tx: SongModerationTransaction) => T | Promise<T>): Promise<T>;
};

export type SongModerationInput = Readonly<{
  actorId: string;
  id: unknown;
  status: unknown;
  rejectionReason?: unknown;
}>;

export function normalizeSongModerationInput(input: Omit<SongModerationInput, "actorId">) {
  if (!isCanonicalUuid(input.id) || typeof input.status !== "string" || !SONG_STATUSES.includes(input.status as SongStatus)) {
    throw new Error("Invalid song moderation input");
  }

  let rejectionReason: string | null = null;
  if (input.status === "REJECTED" && input.rejectionReason != null) {
    if (typeof input.rejectionReason !== "string") throw new Error("Invalid rejection reason");
    const normalized = input.rejectionReason.trim();
    if (
      normalized &&
      ([...normalized].length > REJECTION_REASON_MAX_CHARS ||
        new TextEncoder().encode(normalized).byteLength > REJECTION_REASON_MAX_BYTES ||
        CONTROL.test(normalized))
    ) {
      throw new Error("Invalid rejection reason");
    }
    rejectionReason = normalized || null;
  }

  return {
    id: input.id,
    status: input.status as SongStatus,
    rejectionReason,
  };
}

function buildSongStatusMessage(videoTitle: string, status: SongStatus, rejectionReason: string | null) {
  if (status === "APPROVED") {
    return {
      title: "기상곡 신청 승인",
      content: `신청하신 '${videoTitle}' 곡이 승인되었습니다. 곧 재생될 예정입니다.`,
    };
  }
  if (status === "REJECTED") {
    return {
      title: "기상곡 신청 반려",
      content: rejectionReason
        ? `신청하신 '${videoTitle}' 곡이 반려되었습니다.\n사유: ${rejectionReason}`
        : `신청하신 '${videoTitle}' 곡이 반려되었습니다.`,
    };
  }
  return {
    title: "기상곡 재생 완료",
    content: `신청하신 '${videoTitle}' 곡이 재생되었습니다.`,
  };
}

export async function moderateSongRequest(db: SongModerationDb, rawInput: SongModerationInput) {
  const input = normalizeSongModerationInput(rawInput);
  return db.$transaction(async (tx) => {
    const song = await tx.songRequest.findUnique({
      where: { id: input.id },
      select: { id: true, requesterId: true, videoTitle: true, status: true },
    });
    if (!song) throw new Error("Song request not found");
    if (song.status === input.status) return { changed: false, status: input.status } as const;
    if (!SONG_STATUSES.includes(song.status as SongStatus) || !ALLOWED_TRANSITIONS[song.status as SongStatus].includes(input.status)) {
      throw new Error("Invalid song status transition");
    }

    const updated = await tx.songRequest.updateMany({
      where: { id: input.id, status: song.status },
      data: {
        status: input.status,
        rejectionReason: input.status === "REJECTED" ? input.rejectionReason : null,
      },
    });
    if (updated.count !== 1) throw new Error("Song status changed concurrently");

    const message = buildSongStatusMessage(song.videoTitle, input.status, input.rejectionReason);
    await enforceNotificationLifecycle(tx, 1);
    await tx.notification.create({
      data: {
        userId: song.requesterId,
        type: "SONG",
        title: message.title,
        content: message.content,
        link: "/songs",
      },
    });
    await writeAuditLog(tx, {
      actorId: rawInput.actorId,
      action: "SONG_STATUS_CHANGED",
      target: { type: "SONG_REQUEST", id: input.id },
    });

    return { changed: true, status: input.status } as const;
  });
}
