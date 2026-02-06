import { getTodayMorningSongs, getNextMorningSongs } from "./actions";
import { SongList } from "./song-list";
import { SongRequestForm } from "./request-form";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "기상곡 신청",
  description: "아침 기상곡을 신청하고 다른 학생들이 신청한 곡을 확인하세요.",
};

export default async function SongsPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const todaySongs = await getTodayMorningSongs();
  const nextSongs = await getNextMorningSongs();

  return (
    <div className="p-4 md:p-8 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">기상곡 신청</h1>
          <p className="text-slate-500">
            매일 07:00 ~ 익일 05:00까지 신청 가능합니다.
          </p>
        </div>
      </div>

      <SongRequestForm />

      <div className="space-y-8">
        {/* 오늘의 기상곡 (승인된 곡만) */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">🎵 오늘 아침 나온 기상곡</h2>
            <span className="text-xs font-medium px-2 py-0.5 bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300 rounded-full">승인됨</span>
          </div>
          {todaySongs.length > 0 ? (
            <SongList songs={todaySongs} emptyMessage="오늘 나온 기상곡 내역이 없습니다." />
          ) : (
            <div className="p-8 text-center bg-slate-50 dark:bg-slate-900/50 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800 text-slate-500">
              오늘 선정된 기상곡이 없거나 아직 업데이트되지 않았습니다.
            </div>
          )}
        </div>

        {/* 내일 기상곡 신청 현황 */}
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">📝 내일 기상곡 신청 현황</h2>
            <span className="text-xs font-medium px-2 py-0.5 bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300 rounded-full">진행중</span>
          </div>
          <SongList songs={nextSongs} emptyMessage="아직 신청된 노래가 없습니다. 첫 번째 주인공이 되어보세요! 🎵" />
        </div>
      </div>
    </div>
  )
}