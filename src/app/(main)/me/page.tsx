import { prisma } from "@/lib/db";

import { Settings, Calendar, Music, Plus, Trash2, Star } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { createDDay, deleteDDay, setPrimaryDDay, deleteSongRequest } from "./actions";
import { format, differenceInDays } from "date-fns";
import { ProfileCard } from "./profile-card";
import { PasswordChangeForm } from "./password-change-form";
import { Metadata } from "next";
import { LogoutButton } from "@/components/auth/logout-button";

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
        <h1 className="text-2xl font-bold" style={{ color: "var(--foreground)" }}>내 정보</h1>
        
        <ProfileCard user={dbUser} />
        <PasswordChangeForm />



        <div className="glass rounded-3xl p-6 space-y-4">
            <div className="flex justify-between items-center">
                <h3 className="font-bold flex items-center gap-2" style={{ color: "var(--foreground)" }}>
                    <Calendar className="w-5 h-5" style={{ color: "var(--accent)" }} />
                    나의 D-Day
                </h3>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{dbUser.personalEvents.length}/3</span>
            </div>
            
            <div className="space-y-3">
                {dbUser.personalEvents.map(event => (
                    <div key={event.id} className="flex items-center justify-between p-3 rounded-xl border" style={{ backgroundColor: event.isPrimary ? "var(--surface-2)" : "var(--surface)", borderColor: event.isPrimary ? "var(--accent)" : "var(--border)" }}>
                        <div className="flex items-center gap-3">
                            <form action={setPrimaryDDay}>
                                <input type="hidden" name="id" value={event.id} />
                                <button className="p-1 rounded-full transition-colors" style={{ color: event.isPrimary ? "var(--accent)" : "var(--muted)" }}><Star className="w-5 h-5 fill-current" /></button>
                            </form>
                            <div>
                                <div className="font-medium" style={{ color: "var(--foreground)" }}>{event.title}</div>
                                <div className="text-xs" style={{ color: "var(--muted)" }}>{format(event.targetDate, "yyyy.MM.dd")}</div>
                            </div>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-lg font-bold" style={{ color: "var(--accent)" }}>{differenceInDays(event.targetDate, new Date()) === 0 ? "D-Day" : `D${differenceInDays(event.targetDate, new Date()) > 0 ? "-" : "+"}${Math.abs(differenceInDays(event.targetDate, new Date()))}`}</div>
                            <form action={deleteDDay}>
                                <input type="hidden" name="id" value={event.id} />
                                <button className="transition-colors p-2 -mr-2 tap-target" style={{ color: "var(--muted)" }}><Trash2 className="w-4 h-4" /></button>
                            </form>
                        </div>
                    </div>
                ))}
                {dbUser.personalEvents.length === 0 && <div className="text-center text-sm py-2" style={{ color: "var(--muted)" }}>등록된 일정이 없습니다.</div>}
            </div>

            {dbUser.personalEvents.length < 3 && (
                <form action={createDDay} className="grid grid-cols-1 sm:grid-cols-[1fr_auto_auto] gap-2 mt-4 pt-4 border-t" style={{ borderColor: "var(--border)" }}>
                    <input name="title" type="text" placeholder="일정 제목" required className="flex-1 px-3 py-2 rounded-xl border text-sm focus:outline-none" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                    <input name="date" type="date" required className="px-3 py-2 rounded-xl border text-sm focus:outline-none" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                    <button className="p-2 tap-target rounded-xl transition-colors flex items-center justify-center" style={{ backgroundColor: "var(--accent)", color: "var(--brand-sub)" }}><Plus className="w-5 h-5" /></button>
                </form>
            )}
        </div>

        <div className="glass rounded-3xl p-6 space-y-4">
             <h3 className="font-bold flex items-center gap-2" style={{ color: "var(--foreground)" }}>
                <Music className="w-5 h-5" style={{ color: "var(--accent)" }} />
                최근 기상곡 신청
             </h3>
             <div className="space-y-3">
                {dbUser.songRequests.map(song => (
                    <div key={song.id} className="flex items-center justify-between p-3 rounded-xl group" style={{ backgroundColor: "var(--surface)" }}>
                        <div className="truncate flex-1 mr-4">
                            <div className="font-medium truncate" style={{ color: "var(--foreground)" }}>{song.videoTitle}</div>
                            <div className="text-xs" style={{ color: "var(--muted)" }}>{format(song.createdAt, "MM.dd")}</div>
                        </div>
                        <div className="flex items-center gap-2">
                            <span className="px-2 py-1 rounded-md text-[10px] font-bold whitespace-nowrap" style={{ backgroundColor: "var(--surface-2)", color: song.status === 'APPROVED' ? 'var(--accent)' : 'var(--muted)' }}>
                               {song.status}
                            </span>
                            <form action={deleteSongRequest}>
                                <input type="hidden" name="id" value={song.id} />
                                <button className="transition-colors opacity-0 group-hover:opacity-100" style={{ color: "var(--muted)" }}>
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
        
        <LogoutButton
            className="md:hidden justify-center rounded-2xl border border-[color:var(--border)] py-3 text-sm font-medium"
            next="/login"
        />

        <div className="text-center text-xs text-slate-400 pb-20">
            GSHS.app v1.2.0
        </div>
     </div>
  )
}
