import { addDays, subDays } from "date-fns";

import { formatKST, getKSTDate } from "@/lib/date-utils";

export type SongCycleContext = {
  now: Date;
  isBreakTime: boolean;
  todayDateKey: string;
  yesterdayDateKey: string;
  tomorrowDateKey: string;
  requestCycleDateKey: string;
  finalCycleDateKey: string;
  settlementTargetDateKey: string | null;
};

export function toSongCycleDateKey(date: Date) {
  return formatKST(date, "yyyy-MM-dd");
}

export function getSongCycleContext(now: Date = getKSTDate()): SongCycleContext {
  const hour = now.getHours();
  const isBreakTime = hour >= 5 && hour < 7;

  const todayDateKey = toSongCycleDateKey(now);
  const yesterdayDateKey = toSongCycleDateKey(subDays(now, 1));
  const tomorrowDateKey = toSongCycleDateKey(addDays(now, 1));

  return {
    now,
    isBreakTime,
    todayDateKey,
    yesterdayDateKey,
    tomorrowDateKey,
    requestCycleDateKey: hour >= 7 ? tomorrowDateKey : todayDateKey,
    finalCycleDateKey: hour >= 5 ? todayDateKey : yesterdayDateKey,
    settlementTargetDateKey: hour >= 5 ? todayDateKey : null,
  };
}
