import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { updateSongStatus, updateSongRule } from "./actions";
import { Check, Play, Settings, Music as MusicIcon } from "lucide-react";
import { format } from "date-fns";
import { BanUserButton } from "../admin/songs/ban-user-button";
import { RejectSongButton } from "./reject-song-button";
import { Metadata } from "next";

export const metadata: Metadata = {
   title: "방송부 스튜디오",
   robots: {
      index: false,
      follow: false,
   },
};

export default async function MusicManagerPage() {
   const user = await getCurrentUser();
   if (!user || (user.role !== 'BROADCAST' && user.role !== 'ADMIN')) {
      redirect("/");
   }

   const songs = await prisma.songRequest.findMany({
      orderBy: [{ priorityScore: 'desc' }, { createdAt: 'asc' }],
      include: { requester: true },
      where: { status: { not: 'PLAYED' } } // Hide played songs to keep list clean
   });

   const rules = await prisma.songRule.findMany();
   const days = ["일", "월", "화", "수", "목", "금", "토"];

   return (
      <div className="p-4 md:p-8 space-y-8">
         <div className="flex items-center gap-3">
            <div className="p-3 rounded-full" style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}>
               <MusicIcon className="w-6 h-6" />
            </div>
            <div>
               <h1 className="text-2xl font-bold">방송부 스튜디오</h1>
               <p style={{ color: "var(--muted)" }}>기상곡 신청을 관리하고 규칙을 설정하세요.</p>
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Song List */}
            <div className="lg:col-span-2 space-y-4">
               <h2 className="text-lg font-bold flex items-center gap-2">
                  <span>🎵 신청 목록</span>
                  <span className="text-xs font-normal" style={{ color: "var(--muted)" }}>(우선순위 정렬됨)</span>
               </h2>
               <div className="glass rounded-3xl overflow-hidden">
                  {/* Mobile cards */}
                  <div className="md:hidden p-3 space-y-3">
                     {songs.map(song => (
                        <div key={song.id} className="rounded-2xl border p-3 space-y-2" style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}>
                           <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0">
                                 <div className="text-xs font-mono" style={{ color: "var(--muted)" }}>점수 {song.priorityScore}</div>
                                 <div className="font-medium truncate">{song.videoTitle}</div>
                              </div>
                              <div className="text-right text-xs" style={{ color: "var(--muted)" }}>
                                 <div>{song.requester.name}</div>
                                 <div>{format(song.createdAt, "MM.dd HH:mm")}</div>
                              </div>
                           </div>
                           <a href={song.youtubeUrl} target="_blank" className="text-xs hover:underline block truncate" style={{ color: "var(--accent)" }}>
                              {song.youtubeUrl}
                           </a>

                           <div className="flex items-center gap-2 pt-1">
                              {song.status === 'PENDING' && (
                                 <>
                                    <form action={updateSongStatus.bind(null, song.id, 'APPROVED', undefined)} className="flex-1">
                                       <button className="w-full py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}>승인</button>
                                    </form>
                                    <div className="flex-1">
                                       <RejectSongButton songId={song.id} songTitle={song.videoTitle} variant="full" />
                                    </div>
                                    <BanUserButton userId={song.requester.id} userName={song.requester.name} />
                                 </>
                              )}
                                 {song.status === 'APPROVED' && (
                                  <form action={updateSongStatus.bind(null, song.id, 'PLAYED', undefined)} className="flex-1">
                                    <button className="w-full py-2 rounded-lg text-sm font-semibold" style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}>재생 완료</button>
                                 </form>
                              )}
                              {song.status === 'REJECTED' && (
                                 <div className="flex items-center gap-2 w-full">
                                    <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>반려됨</span>
                                    <BanUserButton userId={song.requester.id} userName={song.requester.name} />
                                 </div>
                              )}
                           </div>
                        </div>
                     ))}
                     {songs.length === 0 && <div className="p-8 text-center" style={{ color: "var(--muted)" }}>대기 중인 신청곡이 없습니다.</div>}
                  </div>

                  {/* Desktop table */}
                  <table className="hidden md:table w-full text-left">
                     <thead className="text-xs font-bold border-b" style={{ backgroundColor: "var(--surface-2)", color: "var(--muted)", borderColor: "var(--border)" }}>
                        <tr>
                           <th className="p-4">점수</th>
                           <th className="p-4">곡 정보</th>
                           <th className="p-4">신청자</th>
                           <th className="p-4 text-right">관리</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y [--tw-divide-color:var(--border)]">
                        {songs.map(song => (
                           <tr key={song.id} className="transition-colors" style={{ backgroundColor: "transparent" }}>
                              <td className="p-4 font-mono text-xs" style={{ color: "var(--muted)" }}>{song.priorityScore}</td>
                              <td className="p-4 max-w-[200px]">
                                 <div className="font-medium truncate">{song.videoTitle}</div>
                                 <a href={song.youtubeUrl} target="_blank" className="text-xs hover:underline truncate block" style={{ color: "var(--accent)" }}>
                                    {song.youtubeUrl}
                                 </a>
                              </td>
                              <td className="p-4 text-sm">
                                 <div>{song.requester.name}</div>
                                 <div className="text-xs" style={{ color: "var(--muted)" }}>{format(song.createdAt, "MM.dd HH:mm")}</div>
                              </td>
                              <td className="p-4 text-right">
                                 <div className="flex justify-end gap-1">
                                    {song.status === 'PENDING' && (
                                       <>
                                          <form action={updateSongStatus.bind(null, song.id, 'APPROVED', undefined)}>
                                             <button className="p-2 rounded-lg" style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}><Check className="w-4 h-4" /></button>
                                          </form>
                                          <RejectSongButton songId={song.id} songTitle={song.videoTitle} variant="icon" />
                                          <BanUserButton userId={song.requester.id} userName={song.requester.name} />
                                       </>
                                    )}
                                     {song.status === 'APPROVED' && (
                                        <form action={updateSongStatus.bind(null, song.id, 'PLAYED', undefined)}>
                                          <button className="p-2 rounded-lg" title="재생 완료" style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}><Play className="w-4 h-4" /></button>
                                       </form>
                                    )}
                                    {song.status === 'REJECTED' && (
                                       <div className="flex items-center gap-2 py-2">
                                          <span className="text-xs font-bold" style={{ color: "var(--muted)" }}>반려됨</span>
                                          <BanUserButton userId={song.requester.id} userName={song.requester.name} />
                                       </div>
                                    )}
                                 </div>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
                  {songs.length === 0 && <div className="hidden md:block p-12 text-center" style={{ color: "var(--muted)" }}>대기 중인 신청곡이 없습니다.</div>}
               </div>
            </div>

            {/* Right: Rules */}
            <div className="space-y-4">
               <h2 className="text-lg font-bold flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  <span>요일별 규칙</span>
               </h2>
               <div className="glass p-6 rounded-3xl space-y-4">
                  <p className="text-xs mb-4" style={{ color: "var(--muted)" }}>
                     각 요일에 신청 가능한 학년을 설정합니다. (쉼표로 구분, 예: "1,2", 모두 허용: "ALL")
                  </p>
                  {days.map((day, idx) => {
                     const rule = rules.find(r => r.dayOfWeek === idx);
                     const currentVal = rule?.allowedGrade || "ALL";

                     return (
                        <form key={day} action={async (formData) => {
                           "use server";
                           await updateSongRule(idx, formData.get("allowedGrade") as string);
                        }} className="flex items-center gap-2">
                           <div className="w-8 font-bold" style={{ color: "var(--foreground)" }}>{day}</div>
                           <input
                              name="allowedGrade"
                              defaultValue={currentVal}
                              className="flex-1 px-3 py-2 rounded-xl border text-sm text-center uppercase"
                              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }}
                           />
                           <button className="text-xs hover:underline" style={{ color: "var(--accent)" }}>저장</button>
                        </form>
                     )
                  })}
               </div>
            </div>
         </div>
      </div>
   )
}
