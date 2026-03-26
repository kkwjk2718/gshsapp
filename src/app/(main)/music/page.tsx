import { Metadata } from "next";
import { redirect } from "next/navigation";
import { Music as MusicIcon, Settings } from "lucide-react";

import { prisma } from "@/lib/db";
import { formatKST } from "@/lib/date-utils";
import { getCurrentUser } from "@/lib/session";
import { getSongCycleContext } from "@/lib/song-cycle";
import {
  ensureTodaySongCycleSettled,
  getFinalSongsForCycle,
  getPendingSongsForCycle,
  getRejectedSongsForCycle,
} from "@/lib/song-queue";
import { getPreferredSlots, getSongSlotLabel, SONG_SLOT_CONFIGS } from "@/lib/song-slots";

import { ApproveSongButton } from "./approve-song-button";
import { RuleSettingsForm } from "./rule-settings-form";
import { RejectSongButton } from "./reject-song-button";
import { BanUserButton } from "../admin/songs/ban-user-button";

export const metadata: Metadata = {
  title: "방송부 스튜디오",
  robots: {
    index: false,
    follow: false,
  },
};

const DAYS = ["일", "월", "화", "수", "목", "금", "토"];

type QueueSong = Awaited<ReturnType<typeof getPendingSongsForCycle>>[number];

function renderPreferredSlotLabel(song: QueueSong) {
  const preferredSlots = getPreferredSlots(song.preferredSlotMask);
  if (preferredSlots.length === 0) {
    return "미지정";
  }

  return preferredSlots.map((slot) => getSongSlotLabel(slot)).join(", ");
}

export default async function MusicManagerPage() {
  const user = await getCurrentUser();
  if (!user || (user.role !== "BROADCAST" && user.role !== "ADMIN")) {
    redirect("/");
  }

  await ensureTodaySongCycleSettled();

  const cycleContext = getSongCycleContext();
  const todaySongs = await getFinalSongsForCycle(cycleContext.finalCycleDateKey);
  const currentQueueSongs = await getPendingSongsForCycle(cycleContext.requestCycleDateKey);
  const rejectedSongs = await getRejectedSongsForCycle(cycleContext.requestCycleDateKey);

  const rules = await prisma.songRule.findMany();
  const ruleRows = DAYS.map((day, idx) => ({
    day,
    dayOfWeek: idx,
    allowedGrade: rules.find((rule) => rule.dayOfWeek === idx)?.allowedGrade || "ALL",
  }));

  const currentQueueTitle =
    cycleContext.requestCycleDateKey === cycleContext.todayDateKey
      ? "오늘 정산 대상 신청곡"
      : "다음 아침 신청곡";

  const todaySongBySlot = new Map(
    todaySongs
      .filter((song) => song.assignedSlot !== null)
      .map((song) => [song.assignedSlot, song] as const),
  );

  return (
    <div className="space-y-8 p-4 md:p-8">
      <div className="flex items-center gap-3">
        <div
          className="rounded-full p-3"
          style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}
        >
          <MusicIcon className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">방송부 스튜디오</h1>
          <p style={{ color: "var(--muted)" }}>
            기상곡 신청을 관리하고 요일별 신청 가능 학생을 설정합니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
        <div className="space-y-8 lg:col-span-2">
          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">오늘 나올 곡</h2>
              <span
                className="rounded-full px-2 py-0.5 text-xs font-medium"
                style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}
              >
                확정 6곡
              </span>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {SONG_SLOT_CONFIGS.map((config) => {
                const song = todaySongBySlot.get(config.slot) ?? null;

                return (
                  <div
                    key={`today-${config.slot}`}
                    className="rounded-2xl border p-4"
                    style={{
                      backgroundColor: "var(--surface)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div className="mb-3 flex items-center justify-between">
                      <span
                        className="inline-flex rounded-full px-2.5 py-1 text-[10px] font-bold"
                        style={{
                          backgroundColor: "var(--surface-2)",
                          color: "var(--accent)",
                        }}
                      >
                        {config.label}
                      </span>
                      {song ? (
                        <span className="text-xs" style={{ color: "var(--muted)" }}>
                          {formatKST(song.createdAt, "MM.dd HH:mm")}
                        </span>
                      ) : null}
                    </div>

                    {song ? (
                      <div className="space-y-2">
                        <div className="font-semibold" style={{ color: "var(--foreground)" }}>
                          {song.videoTitle}
                        </div>
                        <a
                          href={song.youtubeUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="block truncate text-xs hover:underline"
                          style={{ color: "var(--accent)" }}
                        >
                          {song.youtubeUrl}
                        </a>
                        <div className="text-sm" style={{ color: "var(--muted)" }}>
                          {song.requester.name}
                        </div>
                      </div>
                    ) : (
                      <div
                        className="flex min-h-24 items-center justify-center text-center text-sm"
                        style={{ color: "var(--muted)" }}
                      >
                        아직 확정된 곡이 없습니다.
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">{currentQueueTitle}</h2>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                점수 순으로 실시간 재배치
              </span>
            </div>

            <div className="glass overflow-hidden rounded-3xl">
              <div className="space-y-3 p-3 md:hidden">
                {currentQueueSongs.map((song) => (
                  <div
                    key={song.id}
                    className="space-y-3 rounded-2xl border p-3"
                    style={{
                      borderColor: "var(--border)",
                      backgroundColor: "var(--surface)",
                    }}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="text-xs font-mono" style={{ color: "var(--muted)" }}>
                          {song.assignedSlot ? getSongSlotLabel(song.assignedSlot) : "대기열"} · 점수{" "}
                          {song.priorityScore}
                          {song.status === "APPROVED" ? " · 승인됨" : ""}
                        </div>
                        <div className="truncate font-semibold">{song.videoTitle}</div>
                      </div>
                      <div className="text-right text-xs" style={{ color: "var(--muted)" }}>
                        <div>{song.requester.name}</div>
                        <div>{formatKST(song.createdAt, "MM.dd HH:mm")}</div>
                      </div>
                    </div>

                    <a
                      href={song.youtubeUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="block truncate text-xs hover:underline"
                      style={{ color: "var(--accent)" }}
                    >
                      {song.youtubeUrl}
                    </a>

                    <div className="text-xs" style={{ color: "var(--muted)" }}>
                      희망 순서: {renderPreferredSlotLabel(song)}
                    </div>

                    <div className="flex items-center gap-2">
                      <div className="flex-1">
                        <ApproveSongButton
                          songId={song.id}
                          songTitle={song.videoTitle}
                          approved={song.status === "APPROVED"}
                          variant="full"
                        />
                      </div>
                      <div className="flex-1">
                        <RejectSongButton
                          songId={song.id}
                          songTitle={song.videoTitle}
                          variant="full"
                        />
                      </div>
                      <BanUserButton userId={song.requester.id} userName={song.requester.name} />
                    </div>
                  </div>
                ))}

                {currentQueueSongs.length === 0 && (
                  <div className="p-8 text-center" style={{ color: "var(--muted)" }}>
                    현재 대기 중인 신청곡이 없습니다.
                  </div>
                )}
              </div>

              <table className="hidden w-full text-left md:table">
                <thead
                  className="border-b text-xs font-bold"
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
                    <th className="p-4 text-right">관리</th>
                  </tr>
                </thead>
                <tbody className="divide-y [--tw-divide-color:var(--border)]">
                  {currentQueueSongs.map((song) => (
                    <tr key={song.id}>
                      <td
                        className="p-4 text-sm font-semibold"
                        style={{ color: "var(--foreground)" }}
                      >
                        {song.assignedSlot ? getSongSlotLabel(song.assignedSlot) : "대기열"}
                        <div className="text-xs font-normal" style={{ color: "var(--muted)" }}>
                          점수 {song.priorityScore}
                          {song.status === "APPROVED" ? " · 승인됨" : ""}
                        </div>
                      </td>
                      <td className="max-w-[280px] p-4">
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
                        {renderPreferredSlotLabel(song)}
                      </td>
                      <td className="p-4 text-sm">
                        <div>{song.requester.name}</div>
                        <div className="text-xs" style={{ color: "var(--muted)" }}>
                          {formatKST(song.createdAt, "MM.dd HH:mm")}
                        </div>
                      </td>
                      <td className="p-4 text-right">
                        <div className="flex justify-end gap-2">
                          <ApproveSongButton
                            songId={song.id}
                            songTitle={song.videoTitle}
                            approved={song.status === "APPROVED"}
                          />
                          <RejectSongButton songId={song.id} songTitle={song.videoTitle} />
                          <BanUserButton userId={song.requester.id} userName={song.requester.name} />
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {currentQueueSongs.length === 0 && (
                <div className="hidden p-12 text-center md:block" style={{ color: "var(--muted)" }}>
                  현재 대기 중인 신청곡이 없습니다.
                </div>
              )}
            </div>
          </section>

          <section className="space-y-4">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold">반려 목록</h2>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                방송부 스튜디오에서만 표시
              </span>
            </div>

            <div
              className="rounded-3xl border p-4"
              style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
            >
              {rejectedSongs.length === 0 ? (
                <div className="py-8 text-center text-sm" style={{ color: "var(--muted)" }}>
                  반려된 신청곡이 없습니다.
                </div>
              ) : (
                <div className="space-y-3">
                  {rejectedSongs.map((song) => (
                    <div
                      key={song.id}
                      className="rounded-2xl border p-4"
                      style={{
                        borderColor: "var(--border)",
                        backgroundColor: "var(--surface-2)",
                      }}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="truncate font-semibold">{song.videoTitle}</div>
                          <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                            {song.requester.name} · {formatKST(song.createdAt, "MM.dd HH:mm")}
                          </div>
                          <a
                            href={song.youtubeUrl}
                            target="_blank"
                            rel="noreferrer"
                            className="mt-2 block truncate text-xs hover:underline"
                            style={{ color: "var(--accent)" }}
                          >
                            {song.youtubeUrl}
                          </a>
                          {song.rejectionReason ? (
                            <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                              반려 사유: {song.rejectionReason}
                            </p>
                          ) : null}
                        </div>
                        <BanUserButton userId={song.requester.id} userName={song.requester.name} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>

        <section className="space-y-4">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <Settings className="h-5 w-5" />
            <span>요일별 신청 가능 학생</span>
          </h2>
          <RuleSettingsForm initialRules={ruleRows} />
        </section>
      </div>
    </div>
  );
}
