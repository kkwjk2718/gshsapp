"use client"

import { ko } from "date-fns/locale";
import { formatKST } from "@/lib/date-utils";

interface Song {
  id: string;
  videoTitle: string;
  youtubeUrl: string;
  status: string;
  createdAt: Date;
  isAnonymous?: boolean;
  requesterId: string;
  requester: {
    name: string;
    studentId?: string | null;
  }
}

interface SongListProps {
  songs: Song[];
  currentUser?: any;
  emptyMessage?: string;
}

import { User, Ghost, Shield } from "lucide-react";

export function SongList({ songs, currentUser, emptyMessage = "아직 신청된 노래가 없습니다." }: SongListProps) {
  const getYoutubeId = (url: string) => {
    const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
    const match = url.match(regExp);
    return (match && match[2].length === 11) ? match[2] : null;
  };

  const renderRequesterInfo = (song: Song) => {
    const isOwner = currentUser?.id === song.requesterId;
    const isAdminOrBroadcast = currentUser?.role === 'ADMIN' || currentUser?.role === 'BROADCAST';

    // 1. Not Anonymous: Show full info
    if (!song.isAnonymous) {
      return (
        <div className="flex flex-col items-end text-xs" style={{ color: "var(--muted)" }}>
          <span className="font-medium">{song.requester.name} {song.requester.studentId && `(${song.requester.studentId})`}</span>
          <span>{formatKST(song.createdAt, "M.d HH:mm", { locale: ko })}</span>
        </div>
      );
    }

    // 2. Anonymous
    // Admin/Broadcast/Owner can see info, but with indicator
    if (isOwner || isAdminOrBroadcast) {
      return (
        <div className="flex flex-col items-end text-xs">
          <div className="flex items-center gap-1" style={{ color: "var(--muted)" }}>
            <Ghost className="w-3 h-3" style={{ color: "var(--accent)" }} />
            <span className="font-medium">{song.requester.name} {song.requester.studentId && `(${song.requester.studentId})`}</span>
          </div>
          <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>
            {isOwner ? "내 정보 가리기 적용됨" : "익명 신청"}
          </span>
          <span style={{ color: "var(--muted)" }}>{formatKST(song.createdAt, "M.d HH:mm", { locale: ko })}</span>
        </div>
      );
    }

    // 3. Anonymous & Public: Hide info
    return (
      <div className="flex flex-col items-end text-xs" style={{ color: "var(--muted)" }}>
        <div className="flex items-center gap-1">
          <Ghost className="w-3 h-3" />
          <span className="font-medium">익명</span>
        </div>
        <span>--:--</span>
      </div>
    );
  };

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
      {songs.length === 0 && (
        <div className="col-span-full text-center py-12" style={{ color: "var(--muted)" }}>
          {emptyMessage}
        </div>
      )}
      {songs.map((song) => {
        const videoId = getYoutubeId(song.youtubeUrl);
        const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;

        return (
          <div key={song.id} className="glass p-4 rounded-2xl flex flex-col gap-2 group hover:scale-[1.02] transition-transform duration-300 border" style={{ borderColor: "var(--border)" }}>
            <a
              href={song.youtubeUrl}
              target="_blank"
              rel="noreferrer"
              className="block rounded-xl focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] focus:ring-offset-2 focus:ring-offset-[color:var(--surface)]"
            >
              <div className="aspect-video rounded-xl overflow-hidden relative" style={{ backgroundColor: "var(--surface-2)" }}>
                {thumbnailUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumbnailUrl} alt={song.videoTitle} className="w-full h-full object-cover" />
                ) : (
                  <div className="absolute inset-0 flex items-center justify-center text-xs" style={{ color: "var(--muted)" }}>
                    No Thumbnail
                  </div>
                )}
              </div>
            </a>
            <div className="mt-2">
              <a
                href={song.youtubeUrl}
                target="_blank"
                rel="noreferrer"
                className="block truncate font-semibold transition-colors hover:text-[color:var(--accent)]"
                style={{ color: "var(--foreground)" }}
              >
                {song.videoTitle}
              </a>
              <div className="flex items-center justify-between text-xs mt-1" style={{ color: "var(--muted)" }}>
                {/* Replaced masking logic here */}
                {renderRequesterInfo(song)}
              </div>
              <div className="mt-2">
                <span className="inline-block px-2 py-1 rounded-md text-[10px] font-bold" style={{ backgroundColor: "var(--surface-2)", color: song.status === 'APPROVED' ? 'var(--accent)' : 'var(--muted)' }}>
                  {song.status === 'PENDING' ? '대기중' :
                    song.status === 'APPROVED' ? '승인됨 (재생 예정)' :
                      song.status === 'PLAYED' ? '재생됨' : '반려됨'}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
