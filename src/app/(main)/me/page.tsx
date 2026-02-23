import { prisma } from "@/lib/db";

import { Settings, Calendar, Music, Plus, Trash2, Star } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { createDDay, deleteDDay, setPrimaryDDay, deleteSongRequest } from "./actions";
import { format, differenceInDays } from "date-fns";
import { ProfileCard } from "./profile-card";
import { PasswordChangeForm } from "./password-change-form";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "내 정보",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function MyPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const dbUser = await prisma.user.findUnique({
      where: { id: user.id },
      include: { 
          personalEvents: { orderBy: { targetDate: 'asc' } },
          songRequests: { orderBy: { createdAt: 'desc' }, take: 5 }
      }
  });
  
  if (!dbUser) redirect("/login");

  return (
     <div className="mobile-page mobile-safe-bottom max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">내 정보</h1>
        
        <ProfileCard user={dbUser} />
        <PasswordChangeForm />



        <div className="glass rounded-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                    <Calendar className="w-5 h-5 text-indigo-500" />
                    나의 D-Day
                </h3>
                <span className="text-xs text-slate-400">{dbUser.personalEvents.length}/3</span>
            </div>
            
            <div className="space-y-3">
                {dbUser.personalEvents.map(event => (
                    <div key={event.id} className={`flex items-center justify-between p-3 rounded-xl border ${event.isPrimary ? "bg-indigo-50 dark:bg-indigo-900/20 border-indigo-200 dark:border-indigo-800" : "bg-slate-50 dark:bg-slate-800/50 border-transparent"}`}>
                        <div className="flex items-center gap-3">
                            <form action={setPrimaryDDay}>
                                <input type="hidden" name="id" value={event.id} />
                                <button className={`p-1 rounded-full hover:bg-black/5 dark:hover:bg-white/10 transition-colors ${event.isPrimary ? "text-yellow-400" : "text-slate-300"}`}><Star className="w-5 h-5 fill-current" /></button>
                            </form>
                            <div>
                                <div className="font-medium text-slate-800 dark:text-slate-200">{event.title}</div>
                                <div className="text-xs text-slate-500">{format(event.targetDate, "yyyy.MM.dd")}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-lg font-bold text-indigo-600 dark:text-indigo-400">{differenceInDays(event.targetDate, new Date()) === 0 ? "D-Day" : `D${differenceInDays(event.targetDate, new Date()) > 0 ? "-" : "+"}${Math.abs(differenceInDays(event.targetDate, new Date()))}`}</div>
                            <form action={deleteDDay}>
                                <input type="hidden" name="id" value={event.id} />
                                <button className="text-slate-400 hover:text-rose-500 transition-colors p-2 -mr-2 tap-target"><Trash2 className="w-4 h-4" /></button>
                            </form>
                        </div>
                    </div>
                ))}
                {dbUser.personalEvents.length === 0 && <div className="text-center text-sm text-slate-400 py-2">등록된 일정이 없습니다.</div>}
            </div>

            {dbUser.personalEvents.length < 3 && (
                <form action={createDDay} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <input name="title" type="text" placeholder="일정 제목" required className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <input name="date" type="date" required className="px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                    <button className="p-2 tap-target bg-indigo-600 text-white rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center"><Plus className="w-5 h-5" /></button>
                </form>
            )}
        </div>

        <div className="glass rounded-3xl p-6 space-y-4">
             <h3 className="font-bold flex items-center gap-2 text-slate-800 dark:text-slate-100">
                <Music className="w-5 h-5 text-rose-500" />
                최근 기상곡 신청
             </h3>
             <div className="space-y-3">
                {dbUser.songRequests.map(song => (
                    <div key={song.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-800/50 rounded-xl group">
                        <div className="truncate flex-1 mr-4">
                            <div className="font-medium truncate text-slate-800 dark:text-slate-200">{song.videoTitle}</div>
                            <div className="text-xs text-slate-500">{format(song.createdAt, "MM.dd")}</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap
                               ${song.status === 'PENDING' ? 'bg-slate-200 text-slate-600' : 
                                 song.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600' : 
                                 song.status === 'REJECTED' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>
                               {song.status}
                            </span>
                            <form action={deleteSongRequest}>
                                <input type="hidden" name="id" value={song.id} />
                                <button className="text-slate-400 hover:text-rose-500 transition-colors opacity-0 group-hover:opacity-100">
                                    <Trash2 className="w-4 h-4" />
                                </button>
                            </form>
                        </div>
                    </div>
                ))}
                {dbUser.songRequests.length === 0 && (
                    <div className="text-center text-sm text-slate-400 py-2">신청 내역이 없습니다.</div>
                )}
             </div>
        </div>
        
        <div className="text-center text-xs text-slate-400 pb-20">
            GSHS.app v1.2.0
        </div>
     </div>
  )
}