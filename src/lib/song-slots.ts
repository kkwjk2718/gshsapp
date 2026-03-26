export const SONG_SLOT_ORDER = [1, 2, 3, 4, 5, 6] as const;

export type SongSlot = (typeof SONG_SLOT_ORDER)[number];

export const SONG_SLOT_CONFIGS = [
  { slot: 1 as SongSlot, label: "6시 1", buttonLabel: "6시 1번째 곡", rowLabel: "6시" },
  { slot: 2 as SongSlot, label: "6시 2", buttonLabel: "6시 2번째 곡", rowLabel: "6시" },
  { slot: 3 as SongSlot, label: "6시 3", buttonLabel: "6시 3번째 곡", rowLabel: "6시" },
  { slot: 4 as SongSlot, label: "7시 1", buttonLabel: "7시 1번째 곡", rowLabel: "7시" },
  { slot: 5 as SongSlot, label: "7시 2", buttonLabel: "7시 2번째 곡", rowLabel: "7시" },
  { slot: 6 as SongSlot, label: "7시 3", buttonLabel: "7시 3번째 곡", rowLabel: "7시" },
] as const;

export const SONG_SLOT_ROWS = [
  SONG_SLOT_CONFIGS.slice(0, 3),
  SONG_SLOT_CONFIGS.slice(3, 6),
] as const;

export function isSongSlot(value: number): value is SongSlot {
  return SONG_SLOT_ORDER.includes(value as SongSlot);
}

export function getSlotBit(slot: SongSlot): number {
  return 1 << (Number(slot) - 1);
}

export function encodePreferredSlots(values: Array<string | number>): number {
  return values.reduce<number>((mask, value) => {
    const numeric = typeof value === "number" ? value : Number.parseInt(value, 10);
    if (!isSongSlot(numeric)) {
      return mask;
    }

    return mask | getSlotBit(numeric);
  }, 0);
}

export function hasPreferredSlot(mask: number | null | undefined, slot: SongSlot): boolean {
  return ((mask ?? 0) & getSlotBit(slot)) !== 0;
}

export function getPreferredSlots(mask: number | null | undefined): SongSlot[] {
  return SONG_SLOT_ORDER.filter((slot): slot is SongSlot => hasPreferredSlot(mask, slot));
}

export function getSongSlotLabel(slot: SongSlot | number | null | undefined): string {
  const config = SONG_SLOT_CONFIGS.find((item) => item.slot === slot);
  return config?.label ?? "미배치";
}
