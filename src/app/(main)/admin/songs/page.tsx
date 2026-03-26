import { X } from "lucide-react";

import { prisma } from "@/lib/db";
import { formatKST } from "@/lib/date-utils";

import { updateSongStatus } from "./actions";
import { BanUserButton } from "./ban-user-button";

function getStatusTone(status: string) {
  if (status === "FINAL") {
    return "bg-emerald-100 text-emerald-600";
  }

  if (status === "APPROVED") {
    return "bg-blue-100 text-blue-600";
  }

  if (status === "REJECTED") {
    return "bg-rose-100 text-rose-600";
  }

  return "bg-slate-100 text-slate-500";
}

function getStatusLabel(status: string) {
  if (status === "FINAL") {
    return "확정";
  }

  if (status === "APPROVED") {
    return "승인됨";
  }

  if (status === "REJECTED") {
    return "반려됨";
  }

  return "신청중";
}

export default async function AdminSongsPage() {
  const songs = await prisma.songRequest.findMany({
    orderBy: [{ cycleDateKey: "desc" }, { createdAt: "desc" }],
    include: { requester: true },
  });

  return (
    <div className="space-y-8 p-8">
      <h1 className="text-2xl font-bold">기상곡 관리</h1>

      <div className="glass overflow-hidden rounded-3xl">
        <table className="w-full text-left">
          <thead className="border-b border-slate-200 bg-slate-50 dark:border-slate-800 dark:bg-slate-900/50">
            <tr>
              <th className="p-4 font-medium text-slate-500">회차 / 신청자</th>
              <th className="p-4 font-medium text-slate-500">제목 / URL</th>
              <th className="p-4 font-medium text-slate-500">신청일시</th>
              <th className="p-4 font-medium text-slate-500">상태</th>
              <th className="p-4 text-right font-medium text-slate-500">관리</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
            {songs.map((song) => (
              <tr key={song.id} className="transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/30">
                <td className="p-4">
                  <div className="font-medium">{song.requester.name}</div>
                  <div className="text-xs text-slate-400">
                    {song.cycleDateKey} {song.requester.studentId ? `· ${song.requester.studentId}` : ""}
                  </div>
                </td>
                <td className="max-w-xs p-4">
                  <div className="truncate font-medium">{song.videoTitle}</div>
                  <a
                    href={song.youtubeUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="block truncate text-xs text-indigo-500 hover:underline"
                  >
                    {song.youtubeUrl}
                  </a>
                </td>
                <td className="p-4 text-sm text-slate-500">{formatKST(song.createdAt, "MM.dd HH:mm")}</td>
                <td className="p-4">
                  <span className={`rounded-md px-2 py-1 text-xs font-bold ${getStatusTone(song.status)}`}>
                    {getStatusLabel(song.status)}
                  </span>
                </td>
                <td className="p-4 text-right">
                  <div className="flex items-center justify-end gap-2">
                    <BanUserButton userId={song.requesterId} userName={song.requester.name} />
                    {song.status === "PENDING" || song.status === "APPROVED" ? (
                      <form action={updateSongStatus.bind(null, song.id, "REJECTED", undefined)}>
                        <button
                          className="rounded-lg bg-rose-100 p-2 text-rose-600 transition-colors hover:bg-rose-200"
                          title="반려"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </form>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {songs.length === 0 ? (
          <div className="p-12 text-center text-slate-500">신청 이력이 없습니다.</div>
        ) : null}
      </div>
    </div>
  );
}
