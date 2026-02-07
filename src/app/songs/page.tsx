import { getTodayMorningSongs, getNextMorningSongs } from "./actions";
import { SongList } from "./song-list";
import { SongRequestForm } from "./request-form";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { Metadata } from "next";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Music, AlertCircle, Clock, User, Ghost, Shield } from "lucide-react";

// Helper to mask user info
const formatRequester = (request: any, currentUser: any) => {
  const isOwner = currentUser?.id === request.requesterId;
  const isAdminOrBroadcast = currentUser?.role === 'ADMIN' || currentUser?.role === 'BROADCAST';

  // 1. Not Anonymous: Show full info
  if (!request.isAnonymous) {
    return (
      <div className="flex flex-col items-end text-xs text-slate-500 dark:text-slate-400">
        <span className="font-medium">{request.requester.name} {request.requester.studentId && `(${request.requester.studentId})`}</span>
        <span>{format(new Date(request.createdAt), "a h:mm", { locale: ko })}</span>
      </div>
    );
  }

  // 2. Anonymous
  // Admin/Broadcast/Owner can see info, but with indicator
  if (isOwner || isAdminOrBroadcast) {
    return (
      <div className="flex flex-col items-end text-xs">
        <div className="flex items-center gap-1 text-slate-500 dark:text-slate-400">
          <Ghost className="w-3 h-3 text-purple-500" />
          <span className="font-medium">{request.requester.name} {request.requester.studentId && `(${request.requester.studentId})`}</span>
        </div>
        <span className="text-purple-600 dark:text-purple-400 text-[10px] font-bold">
          {isOwner ? "내 정보 가리기 적용됨" : "익명 신청"}
        </span>
        <span className="text-slate-400">{format(new Date(request.createdAt), "a h:mm", { locale: ko })}</span>
      </div>
    );
  }

  // 3. Anonymous & Public: Hide info
  return (
    <div className="flex flex-col items-end text-xs text-slate-400">
      <div className="flex items-center gap-1">
        <Ghost className="w-3 h-3" />
        <span className="font-medium">익명</span>
      </div>
      <span>--:--</span>
    </div>
  );
};

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
            <SongList songs={todaySongs} currentUser={user} emptyMessage="오늘 나온 기상곡 내역이 없습니다." />
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
          <SongList songs={nextSongs} currentUser={user} emptyMessage="아직 신청된 노래가 없습니다. 첫 번째 주인공이 되어보세요! 🎵" />
        </div>
      </div>
    </div>
  )
}