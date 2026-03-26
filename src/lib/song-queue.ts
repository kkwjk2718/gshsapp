import "server-only";

import { prisma } from "@/lib/db";
import { getSongCycleContext } from "@/lib/song-cycle";
import { getPreferredSlots, SONG_SLOT_ORDER, type SongSlot } from "@/lib/song-slots";

type PlacementSong = {
  id: string;
  preferredSlotMask: number;
  priorityScore: number;
  createdAt: Date;
};

function compareSongsByPriority(a: PlacementSong, b: PlacementSong) {
  if (b.priorityScore !== a.priorityScore) {
    return b.priorityScore - a.priorityScore;
  }

  return a.createdAt.getTime() - b.createdAt.getTime();
}

export function buildSongPlacement<T extends PlacementSong>(songs: T[]) {
  const slotAssignments = new Map<SongSlot, T>();
  const assignedById = new Map<string, SongSlot | null>();
  const overflow: T[] = [];

  for (const song of [...songs].sort(compareSongsByPriority)) {
    const preferredSlots = getPreferredSlots(song.preferredSlotMask);
    const assignedSlot =
      preferredSlots.find((slot) => !slotAssignments.has(slot)) ??
      SONG_SLOT_ORDER.find((slot) => !slotAssignments.has(slot)) ??
      null;

    assignedById.set(song.id, assignedSlot);

    if (assignedSlot) {
      slotAssignments.set(assignedSlot, song);
      continue;
    }

    overflow.push(song);
  }

  return {
    slots: SONG_SLOT_ORDER.map((slot) => ({
      slot,
      song: slotAssignments.get(slot) ?? null,
    })),
    overflow,
    assignedById,
  };
}

function sortQueuedSongs<T extends { assignedSlot: number | null; priorityScore: number; createdAt: Date }>(
  songs: T[],
) {
  return [...songs].sort((a, b) => {
    const slotA = a.assignedSlot ?? Number.MAX_SAFE_INTEGER;
    const slotB = b.assignedSlot ?? Number.MAX_SAFE_INTEGER;

    if (slotA !== slotB) {
      return slotA - slotB;
    }

    if (b.priorityScore !== a.priorityScore) {
      return b.priorityScore - a.priorityScore;
    }

    return a.createdAt.getTime() - b.createdAt.getTime();
  });
}

export async function recalculatePendingSongAssignments(cycleDateKey: string) {
  const songs = await prisma.songRequest.findMany({
    where: {
      cycleDateKey,
      status: {
        in: ["PENDING", "APPROVED"],
      },
    },
    select: {
      id: true,
      preferredSlotMask: true,
      priorityScore: true,
      createdAt: true,
    },
  });

  const placement = buildSongPlacement(songs);

  await prisma.$transaction(
    songs.map((song) =>
      prisma.songRequest.update({
        where: { id: song.id },
        data: {
          assignedSlot: placement.assignedById.get(song.id) ?? null,
        },
      }),
    ),
  );

  return placement;
}

export async function settleSongCycle(cycleDateKey: string) {
  const songs = await prisma.songRequest.findMany({
    where: {
      cycleDateKey,
      status: {
        in: ["PENDING", "APPROVED", "REJECTED"],
      },
    },
    select: {
      id: true,
      preferredSlotMask: true,
      priorityScore: true,
      createdAt: true,
      status: true,
    },
  });

  if (songs.length === 0) {
    return;
  }

  const activeSongs = songs.filter((song) => song.status !== "REJECTED");
  const placement = buildSongPlacement(activeSongs);
  const settledAt = new Date();
  const finalSongs = placement.slots
    .map(({ slot, song }) => ({ slot, song }))
    .filter((entry): entry is { slot: SongSlot; song: (typeof activeSongs)[number] } => entry.song !== null);

  await prisma.$transaction(async (tx) => {
    for (const { slot, song } of finalSongs) {
      await tx.songRequest.update({
        where: { id: song.id },
        data: {
          assignedSlot: slot,
          status: "FINAL",
          settledAt,
          rejectionReason: null,
        },
      });
    }

    await tx.songRequest.deleteMany({
      where: {
        cycleDateKey,
        status: {
          in: ["PENDING", "APPROVED", "REJECTED"],
        },
      },
    });
  });
}

export async function ensureTodaySongCycleSettled() {
  const { settlementTargetDateKey } = getSongCycleContext();
  if (!settlementTargetDateKey) {
    return;
  }

  const pendingCount = await prisma.songRequest.count({
    where: {
      cycleDateKey: settlementTargetDateKey,
      status: {
        in: ["PENDING", "APPROVED", "REJECTED"],
      },
    },
  });

  if (pendingCount > 0) {
    await settleSongCycle(settlementTargetDateKey);
  }
}

export async function getFinalSongsForCycle(cycleDateKey: string) {
  return prisma.songRequest.findMany({
    where: {
      cycleDateKey,
      status: "FINAL",
    },
    include: {
      requester: true,
    },
    orderBy: {
      assignedSlot: "asc",
    },
  });
}

export async function getPendingSongsForCycle(cycleDateKey: string) {
  await recalculatePendingSongAssignments(cycleDateKey);

  const songs = await prisma.songRequest.findMany({
    where: {
      cycleDateKey,
      status: {
        in: ["PENDING", "APPROVED"],
      },
    },
    include: {
      requester: true,
    },
  });

  return sortQueuedSongs(songs);
}

export async function getRejectedSongsForCycle(cycleDateKey: string) {
  const songs = await prisma.songRequest.findMany({
    where: {
      cycleDateKey,
      status: "REJECTED",
    },
    include: {
      requester: true,
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  return sortQueuedSongs(songs);
}
