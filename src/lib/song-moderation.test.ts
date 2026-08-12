import { describe, expect, it, vi } from "vitest";

import {
  moderateSongRequest,
  normalizeSongModerationInput,
} from "@/lib/song-moderation";

const SONG_ID = "11111111-1111-4111-8111-111111111111";
const ACTOR_ID = "22222222-2222-4222-8222-222222222222";

function createDb(currentStatus = "PENDING", updateCount = 1) {
  const tx = {
    songRequest: {
      findUnique: vi.fn().mockResolvedValue({
        id: SONG_ID,
        requesterId: "requester-1",
        videoTitle: "Morning song",
        status: currentStatus,
      }),
      updateMany: vi.fn().mockResolvedValue({ count: updateCount }),
    },
    notification: { create: vi.fn().mockResolvedValue({ id: "notification-1" }) },
    auditLog: { create: vi.fn().mockResolvedValue({ id: "audit-1" }) },
  };
  return {
    tx,
    db: { $transaction: vi.fn(async (callback: (value: typeof tx) => unknown) => callback(tx)) } as unknown as import("@/lib/song-moderation").SongModerationDb,
  };
}

describe("song moderation", () => {
  it("rejects unknown states, malformed identifiers, and oversized reasons", () => {
    expect(() => normalizeSongModerationInput({ id: "bad", status: "APPROVED" })).toThrow();
    expect(() => normalizeSongModerationInput({ id: SONG_ID, status: "DELETED" })).toThrow();
    expect(() => normalizeSongModerationInput({
      id: SONG_ID,
      status: "REJECTED",
      rejectionReason: "x".repeat(501),
    })).toThrow();
  });

  it("changes a legal state once and writes notification and audit atomically", async () => {
    const { db, tx } = createDb();
    await expect(moderateSongRequest(db, {
      actorId: ACTOR_ID,
      id: SONG_ID,
      status: "APPROVED",
    })).resolves.toEqual({ changed: true, status: "APPROVED" });

    expect(tx.songRequest.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: SONG_ID, status: "PENDING" },
    }));
    expect(tx.notification.create).toHaveBeenCalledOnce();
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorId: ACTOR_ID,
        action: "SONG_STATUS_CHANGED",
        targetType: "SONG_REQUEST",
        targetId: SONG_ID,
      }),
    });
  });

  it("is idempotent and does not duplicate side effects", async () => {
    const { db, tx } = createDb("APPROVED");
    await expect(moderateSongRequest(db, {
      actorId: ACTOR_ID,
      id: SONG_ID,
      status: "APPROVED",
    })).resolves.toEqual({ changed: false, status: "APPROVED" });
    expect(tx.songRequest.updateMany).not.toHaveBeenCalled();
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });

  it.each([
    ["PENDING", "PLAYED"],
    ["APPROVED", "REJECTED"],
    ["REJECTED", "APPROVED"],
    ["PLAYED", "PENDING"],
  ])("rejects illegal transition %s -> %s", async (from, to) => {
    const { db, tx } = createDb(from);
    await expect(moderateSongRequest(db, {
      actorId: ACTOR_ID,
      id: SONG_ID,
      status: to,
    })).rejects.toThrow("Invalid song status transition");
    expect(tx.songRequest.updateMany).not.toHaveBeenCalled();
  });

  it("aborts all side effects when a concurrent update wins", async () => {
    const { db, tx } = createDb("PENDING", 0);
    await expect(moderateSongRequest(db, {
      actorId: ACTOR_ID,
      id: SONG_ID,
      status: "APPROVED",
    })).rejects.toThrow("Song status changed concurrently");
    expect(tx.notification.create).not.toHaveBeenCalled();
    expect(tx.auditLog.create).not.toHaveBeenCalled();
  });
});
