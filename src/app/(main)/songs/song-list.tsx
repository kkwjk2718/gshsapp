"use client";

import { Ghost } from "lucide-react";
import { ko } from "date-fns/locale";

import { formatKST } from "@/lib/date-utils";
import { getPreferredSlots, getSongSlotLabel, SONG_SLOT_CONFIGS } from "@/lib/song-slots";

type Song = {
  id: string;
  videoTitle: string;
  youtubeUrl: string;
  status: string;
  createdAt: Date;
  isAnonymous?: boolean;
  requesterId: string;
  assignedSlot: number | null;
  preferredSlotMask: number;
  requester: {
    name: string;
    studentId?: string | null;
  };
};

interface SongListProps {
  songs: Song[];
  currentUser?: { id?: string; role?: string } | null;
  emptyMessage?: string;
  showOverflow?: boolean;
  overflowDesktopOnly?: boolean;
  overflowTitle?: string;
}

function getYoutubeId(url: string) {
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|watch\?v=|&v=)([^#&?]*).*/;
  const match = url.match(regExp);
  return match && match[2]?.length === 11 ? match[2] : null;
}

function getStatusLabel(status: string) {
  switch (status) {
    case "FINAL":
      return "확정";
    case "APPROVED":
      return "승인됨";
    case "REJECTED":
      return "반려됨";
    default:
      return "신청중";
  }
}

function getStatusColor(status: string) {
  if (status === "FINAL") {
    return "var(--accent)";
  }

  if (status === "APPROVED") {
    return "#16a34a";
  }

  if (status === "REJECTED") {
    return "#f87171";
  }

  return "var(--muted)";
}

export function SongList({
  songs,
  currentUser,
  emptyMessage = "아직 신청된 노래가 없습니다.",
  showOverflow = false,
  overflowDesktopOnly = false,
  overflowTitle = "대기열",
}: SongListProps) {
  const visibleSongs = songs.filter((song) => song.status !== "REJECTED");
  const songsBySlot = new Map(
    visibleSongs
      .filter((song) => song.assignedSlot !== null)
      .map((song) => [song.assignedSlot, song] as const),
  );
  const overflowSongs = visibleSongs.filter((song) => song.assignedSlot === null);

  const getRequesterSummary = (song: Song) => {
    const isOwner = currentUser?.id === song.requesterId;
    const isAdminOrBroadcast = currentUser?.role === "ADMIN" || currentUser?.role === "BROADCAST";
    const baseName = `${song.requester.name}${song.requester.studentId ? ` (${song.requester.studentId})` : ""}`;

    if (!song.isAnonymous) {
      return {
        primary: baseName,
        secondary: formatKST(song.createdAt, "M.d HH:mm", { locale: ko }),
      };
    }

    if (isOwner || isAdminOrBroadcast) {
      return {
        primary: baseName,
        secondary: isOwner ? "내 정보 가리기 적용" : "익명 신청",
        tertiary: formatKST(song.createdAt, "M.d HH:mm", { locale: ko }),
      };
    }

    return {
      primary: "익명",
      secondary: "--:--",
    };
  };

  const renderRequesterInfo = (song: Song) => {
    const isOwner = currentUser?.id === song.requesterId;
    const isAdminOrBroadcast = currentUser?.role === "ADMIN" || currentUser?.role === "BROADCAST";

    if (!song.isAnonymous) {
      return (
        <div className="flex flex-col items-end text-xs" style={{ color: "var(--muted)" }}>
          <span className="font-medium">
            {song.requester.name} {song.requester.studentId && `(${song.requester.studentId})`}
          </span>
          <span>{formatKST(song.createdAt, "M.d HH:mm", { locale: ko })}</span>
        </div>
      );
    }

    if (isOwner || isAdminOrBroadcast) {
      return (
        <div className="flex flex-col items-end text-xs">
          <div className="flex items-center gap-1" style={{ color: "var(--muted)" }}>
            <Ghost className="h-3 w-3" style={{ color: "var(--accent)" }} />
            <span className="font-medium">
              {song.requester.name} {song.requester.studentId && `(${song.requester.studentId})`}
            </span>
          </div>
          <span className="text-[10px] font-bold" style={{ color: "var(--accent)" }}>
            {isOwner ? "내 정보 가리기 적용" : "익명 신청"}
          </span>
          <span style={{ color: "var(--muted)" }}>{formatKST(song.createdAt, "M.d HH:mm", { locale: ko })}</span>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-end text-xs" style={{ color: "var(--muted)" }}>
        <div className="flex items-center gap-1">
          <Ghost className="h-3 w-3" />
          <span className="font-medium">익명</span>
        </div>
        <span>--:--</span>
      </div>
    );
  };

  const renderSongCard = (song: Song, slotLabel: string) => {
    const videoId = getYoutubeId(song.youtubeUrl);
    const thumbnailUrl = videoId ? `https://img.youtube.com/vi/${videoId}/mqdefault.jpg` : null;
    const preferredSlots = getPreferredSlots(song.preferredSlotMask);

    return (
      <div
        key={`${slotLabel}-${song.id}`}
        className="glass flex flex-col gap-3 rounded-2xl border p-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div className="flex items-center justify-between gap-2">
          <span
            className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}
          >
            {slotLabel}
          </span>
          <span
            className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold"
            style={{ backgroundColor: "var(--surface-2)", color: getStatusColor(song.status) }}
          >
            {getStatusLabel(song.status)}
          </span>
        </div>

        <a
          href={song.youtubeUrl}
          target="_blank"
          rel="noreferrer"
          className="block overflow-hidden rounded-xl"
        >
          <div className="aspect-video rounded-xl overflow-hidden" style={{ backgroundColor: "var(--surface-2)" }}>
            {thumbnailUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={thumbnailUrl} alt={song.videoTitle} className="h-full w-full object-cover" />
            ) : (
              <div className="flex h-full items-center justify-center text-xs" style={{ color: "var(--muted)" }}>
                No Thumbnail
              </div>
            )}
          </div>
        </a>

        <div className="space-y-2">
          <a
            href={song.youtubeUrl}
            target="_blank"
            rel="noreferrer"
            className="block truncate text-base font-semibold hover:text-[color:var(--accent)]"
            style={{ color: "var(--foreground)" }}
          >
            {song.videoTitle}
          </a>

          <div className="flex items-start justify-between gap-3">{renderRequesterInfo(song)}</div>

          {preferredSlots.length > 0 ? (
            <div className="flex flex-wrap gap-1">
              {preferredSlots.map((slot) => (
                <span
                  key={`${song.id}-${slot}`}
                  className="rounded-full px-2 py-1 text-[10px] font-semibold"
                  style={{ backgroundColor: "var(--surface-2)", color: "var(--muted)" }}
                >
                  희망 {getSongSlotLabel(slot)}
                </span>
              ))}
            </div>
          ) : (
            <div className="text-[11px]" style={{ color: "var(--muted)" }}>
              희망 순서 미지정
            </div>
          )}
        </div>
      </div>
    );
  };

  if (visibleSongs.length === 0) {
    return (
      <div
        className="rounded-2xl border border-dashed p-8 text-center"
        style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--muted)" }}
      >
        {emptyMessage}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {SONG_SLOT_CONFIGS.map((config) => {
          const song = songsBySlot.get(config.slot) ?? null;

          if (!song) {
            return (
              <div
                key={`empty-${config.slot}`}
                className="rounded-2xl border border-dashed p-4"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
              >
                <div className="mb-3 flex items-center justify-between">
                  <span
                    className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold"
                    style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}
                  >
                    {config.label}
                  </span>
                </div>
                <div className="flex min-h-32 items-center justify-center text-sm text-center" style={{ color: "var(--muted)" }}>
                  아직 배치된 곡이 없습니다.
                </div>
              </div>
            );
          }

          return renderSongCard(song, config.label);
        })}
      </div>

      {showOverflow && overflowSongs.length > 0 ? (
        <div className={overflowDesktopOnly ? "hidden md:block" : ""}>
          <div
            className="rounded-2xl border p-4"
            style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                {overflowTitle}
              </h3>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                {overflowSongs.length}곡
              </span>
            </div>

            <div
              className="overflow-hidden rounded-2xl border"
              style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
            >
              <div className="max-h-[28rem] overflow-y-auto">
                <table className="w-full text-left">
                  <thead
                    className="sticky top-0 z-10 border-b text-xs font-bold"
                    style={{
                      backgroundColor: "var(--surface-2)",
                      color: "var(--muted)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <tr>
                      <th className="p-4">순서</th>
                      <th className="p-4">곡 정보</th>
                      <th className="p-4">희망 순서</th>
                      <th className="p-4">신청자</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y [--tw-divide-color:var(--border)]">
                    {overflowSongs.map((song, index) => {
                      const preferredSlots = getPreferredSlots(song.preferredSlotMask);
                      const requesterSummary = getRequesterSummary(song);

                      return (
                        <tr key={`overflow-${song.id}`}>
                          <td className="p-4 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                            대기열 {index + 1}
                            {song.status === "APPROVED" ? (
                              <div className="text-xs font-normal" style={{ color: "#16a34a" }}>
                                승인됨
                              </div>
                            ) : null}
                          </td>
                          <td className="max-w-[320px] p-4">
                            <div className="truncate font-medium">{song.videoTitle}</div>
                            <a
                              href={song.youtubeUrl}
                              target="_blank"
                              rel="noreferrer"
                              className="block truncate text-xs hover:underline"
                              style={{ color: "var(--accent)" }}
                            >
                              {song.youtubeUrl}
                            </a>
                          </td>
                          <td className="p-4 text-sm" style={{ color: "var(--muted)" }}>
                            {preferredSlots.length > 0
                              ? preferredSlots.map((slot) => getSongSlotLabel(slot)).join(", ")
                              : "미지정"}
                          </td>
                          <td className="p-4 text-sm">
                            <div>{requesterSummary.primary}</div>
                            <div className="text-xs" style={{ color: "var(--muted)" }}>
                              {requesterSummary.secondary}
                            </div>
                            {"tertiary" in requesterSummary && requesterSummary.tertiary ? (
                              <div className="text-xs" style={{ color: "var(--muted)" }}>
                                {requesterSummary.tertiary}
                              </div>
                            ) : null}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
