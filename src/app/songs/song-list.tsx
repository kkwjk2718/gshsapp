"use client"

import { format } from "date-fns";
import { ko } from "date-fns/locale";

interface Song {
  id: string;
  videoTitle: string;
  youtubeUrl: string;
  status: string;
  createdAt: Date;
  requester: {
    name: string;
  }
}

export function SongList({ songs }: { songs: Song[] }) {
  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {songs.length === 0 && (
        <div className="col-span-full text-center py-12 text-slate-500">
            아직 신청된 노래가 없습니다. 첫 번째 주인공이 되어보세요! 🎵
        </div>
      )}
      {songs.map((song) => {
        const videoId = getYoutubeId(song.youtubeUrl);
        const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;

        return (
        <div key={song.id} className="glass p-4 rounded-2xl flex flex-col gap-2 group hover:scale-[1.02] transition-transform duration-300">
           <div className="aspect-video bg-slate-200 dark:bg-slate-800 rounded-xl overflow-hidden relative">
              {thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnailUrl} alt={song.videoTitle} className="w-full h-full object-cover" />
              ) : (
                <div className="absolute inset-0 flex items-center justify-center text-slate-400 text-xs">
                    No Thumbnail
                </div>
              )}
           </div>
           <div className="mt-2">
              <h3 className="font-semibold truncate">{song.videoTitle}</h3>
              <div className="flex items-center justify-between text-xs text-slate-500 mt-1">
                 <span>{song.requester.name}</span>
                 <span>{format(song.createdAt, "M.d HH:mm", { locale: ko })}</span>
              </div>
              <div className="mt-2">
                <span className={`inline-block px-2 py-1 rounded-md text-[10px] font-bold 
                  ${song.status === 'PENDING' ? 'bg-slate-100 dark:bg-slate-800 text-slate-500' : 
                    song.status === 'APPROVED' ? 'bg-emerald-100 dark:bg-emerald-900 text-emerald-600' : 'bg-rose-100 dark:bg-rose-900 text-rose-600'}`}>
                  {song.status === 'PENDING' ? '대기중' : song.status}
                </span>
              </div>
           </div>
        </div>
      )})}
    </div>
  )
}
