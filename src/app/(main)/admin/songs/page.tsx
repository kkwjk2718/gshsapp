import { prisma } from "@/lib/db";
import { updateSongStatus } from "./actions";
import { Check, X, Play } from "lucide-react";
import { format } from "date-fns";
import { BanUserButton } from "./ban-user-button";

export default async function AdminSongsPage() {
  const songs = await prisma.songRequest.findMany({
    orderBy: { createdAt: "desc" },
    include: { requester: true },
  });

  return (
    <div className="p-8 space-y-8">
       <h1 className="text-2xl font-bold">기상곡 관리</h1>

       <div className="glass rounded-3xl overflow-hidden">
          <table className="w-full text-left">
             <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                <tr>
                   <th className="p-4 font-medium text-slate-500">신청자</th>
                   <th className="p-4 font-medium text-slate-500">제목 / URL</th>
                   <th className="p-4 font-medium text-slate-500">신청일시</th>
                   <th className="p-4 font-medium text-slate-500">상태</th>
                   <th className="p-4 font-medium text-slate-500 text-right">관리</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {songs.map((song) => (
                   <tr key={song.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-4">
                         <div className="font-medium">{song.requester.name}</div>
                         <div className="text-xs text-slate-400">{song.requester.studentId}</div>
                      </td>
                      <td className="p-4 max-w-xs truncate">
                         <div className="font-medium truncate">{song.videoTitle}</div>
                         <a href={song.youtubeUrl} target="_blank" className="text-xs text-indigo-500 hover:underline truncate block">
                            {song.youtubeUrl}
                         </a>
                      </td>
                      <td className="p-4 text-sm text-slate-500">
                         {format(song.createdAt, "MM.dd HH:mm")}
                      </td>
                      <td className="p-4">
                         <span className={`px-2 py-1 rounded-md text-xs font-bold 
                           ${song.status === 'PENDING' ? 'bg-slate-100 text-slate-500' : 
                             song.status === 'APPROVED' ? 'bg-emerald-100 text-emerald-600' : 
                             song.status === 'REJECTED' ? 'bg-rose-100 text-rose-600' : 'bg-blue-100 text-blue-600'}`}>
                           {song.status}
                         </span>
                      </td>
                      <td className="p-4 text-right">
                         <div className="flex items-center justify-end gap-2">
                            <BanUserButton userId={song.requesterId} userName={song.requester.name} />
                            {song.status === 'PENDING' && (
                               <>
                                   <form action={updateSongStatus.bind(null, song.id, 'APPROVED', undefined)}>
                                     <button className="p-2 rounded-lg bg-emerald-100 text-emerald-600 hover:bg-emerald-200 transition-colors" title="승인">
                                        <Check className="w-4 h-4" />
                                     </button>
                                  </form>
                                   <form action={updateSongStatus.bind(null, song.id, 'REJECTED', undefined)}>
                                     <button className="p-2 rounded-lg bg-rose-100 text-rose-600 hover:bg-rose-200 transition-colors" title="반려">
                                        <X className="w-4 h-4" />
                                     </button>
                                  </form>
                               </>
                            )}
                            {song.status === 'APPROVED' && (
                                <form action={updateSongStatus.bind(null, song.id, 'PLAYED', undefined)}>
                                     <button className="p-2 rounded-lg bg-blue-100 text-blue-600 hover:bg-blue-200 transition-colors" title="재생 완료 처리">
                                        <Play className="w-4 h-4" />
                                     </button>
                                </form>
                            )}
                         </div>
                      </td>
                   </tr>
                ))}
             </tbody>
          </table>
          {songs.length === 0 && (
             <div className="p-12 text-center text-slate-500">신청 내역이 없습니다.</div>
          )}
       </div>
    </div>
  )
}
