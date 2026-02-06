import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";
import { updateSongStatus, updateSongRule } from "./actions";
import { Check, X, Play, Settings, Music as MusicIcon } from "lucide-react";
import { format } from "date-fns";
import { BanUserButton } from "../admin/songs/ban-user-button";
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
            <div className="p-3 bg-rose-100 dark:bg-rose-900/30 rounded-full text-rose-600">
               <MusicIcon className="w-6 h-6" />
            </div>
            <div>
               <h1 className="text-2xl font-bold">방송부 스튜디오</h1>
               <p className="text-slate-500">기상곡 신청을 관리하고 규칙을 설정하세요.</p>
            </div>
         </div>

         <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Left: Song List */}
            <div className="lg:col-span-2 space-y-4">
               <h2 className="text-lg font-bold flex items-center gap-2">
                  <span>🎵 신청 목록</span>
                  <span className="text-xs font-normal text-slate-400">(우선순위 정렬됨)</span>
               </h2>
               <div className="glass rounded-3xl overflow-hidden">
                  <table className="w-full text-left">
                     <thead className="bg-slate-50 dark:bg-slate-900/50 text-xs font-bold text-slate-500 border-b border-slate-200 dark:border-slate-800">
                        <tr>
                           <th className="p-4">점수</th>
                           <th className="p-4">곡 정보</th>
                           <th className="p-4">신청자</th>
                           <th className="p-4 text-right">관리</th>
                        </tr>
                     </thead>
                     <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                        {songs.map(song => (
                           <tr key={song.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                              <td className="p-4 font-mono text-xs text-slate-400">{song.priorityScore}</td>
                              <td className="p-4 max-w-[200px]">
                                 <div className="font-medium truncate">{song.videoTitle}</div>
                                 <a href={song.youtubeUrl} target="_blank" className="text-xs text-indigo-500 hover:underline truncate block">
                                    {song.youtubeUrl}
                                 </a>
                              </td>
                              <td className="p-4 text-sm">
                                 <div>{song.requester.name}</div>
                                 <div className="text-xs text-slate-400">{format(song.createdAt, "MM.dd HH:mm")}</div>
                              </td>
                              <td className="p-4 text-right">
                                 <div className="flex justify-end gap-1">
                                    {song.status === 'PENDING' && (
                                       <>
                                          <form action={updateSongStatus.bind(null, song.id, 'APPROVED')}>
                                             <button className="p-2 bg-emerald-100 text-emerald-600 rounded-lg hover:bg-emerald-200"><Check className="w-4 h-4" /></button>
                                          </form>
                                          <form action={updateSongStatus.bind(null, song.id, 'REJECTED')}>
                                             <button className="p-2 bg-rose-100 text-rose-600 rounded-lg hover:bg-rose-200" title="반려"><X className="w-4 h-4" /></button>
                                          </form>
                                          <BanUserButton userId={song.requester.id} userName={song.requester.name} />
                                       </>
                                    )}
                                    {song.status === 'APPROVED' && (
                                       <form action={updateSongStatus.bind(null, song.id, 'PLAYED')}>
                                          <button className="p-2 bg-blue-100 text-blue-600 rounded-lg hover:bg-blue-200" title="재생 완료"><Play className="w-4 h-4" /></button>
                                       </form>
                                    )}
                                    {song.status === 'REJECTED' && (
                                       <div className="flex items-center gap-2 py-2">
                                          <span className="text-xs text-rose-500 font-bold">반려됨</span>
                                          <BanUserButton userId={song.requester.id} userName={song.requester.name} />
                                       </div>
                                    )}
                                 </div>
                              </td>
                           </tr>
                        ))}
                     </tbody>
                  </table>
                  {songs.length === 0 && <div className="p-12 text-center text-slate-500">대기 중인 신청곡이 없습니다.</div>}
               </div>
            </div>

            {/* Right: Rules */}
            <div className="space-y-4">
               <h2 className="text-lg font-bold flex items-center gap-2">
                  <Settings className="w-5 h-5" />
                  <span>요일별 규칙</span>
               </h2>
               <div className="glass p-6 rounded-3xl space-y-4">
                  <p className="text-xs text-slate-500 mb-4">
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
                           <div className="w-8 font-bold text-slate-600">{day}</div>
                           <input
                              name="allowedGrade"
                              defaultValue={currentVal}
                              className="flex-1 px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-sm text-center uppercase"
                           />
                           <button className="text-xs text-indigo-500 hover:underline">저장</button>
                        </form>
                     )
                  })}
               </div>
            </div>
         </div>
      </div>
   )
}
