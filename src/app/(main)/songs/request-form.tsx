"use client";

import { AlertCircle, Clock, Plus, Search } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { SONG_SLOT_ROWS } from "@/lib/song-slots";

import { requestSong } from "./actions";

type WeeklyRule = {
  dayOfWeek: number;
  label: string;
  isToday: boolean;
};

interface SongRequestFormProps {
  isAllowedGrade: boolean;
  isBreakTime: boolean;
  todayAllowedGradesLabel: string;
  weeklyRules: WeeklyRule[];
}

function getWeekdayLabel(dayOfWeek: number) {
  switch (dayOfWeek) {
    case 0:
      return "일요일";
    case 1:
      return "월요일";
    case 2:
      return "화요일";
    case 3:
      return "수요일";
    case 4:
      return "목요일";
    case 5:
      return "금요일";
    case 6:
      return "토요일";
    default:
      return "미정";
  }
}

export function SongRequestForm({
  isAllowedGrade,
  isBreakTime: initialBreakTime,
  todayAllowedGradesLabel,
  weeklyRules,
}: SongRequestFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isBreakTime, setIsBreakTime] = useState(initialBreakTime);
  const [selectedSlots, setSelectedSlots] = useState<number[]>([]);

  useEffect(() => {
    const checkTime = () => {
      const now = new Date();
      const hours = now.getHours();
      setIsBreakTime(hours >= 5 && hours < 7);
    };

    checkTime();
    const interval = setInterval(checkTime, 60_000);
    return () => clearInterval(interval);
  }, []);

  const isFormLocked = isBreakTime || !isAllowedGrade;
  const lockedMessage = isBreakTime
    ? "지금은 정산 시간대라 신청할 수 없습니다."
    : `오늘은 ${todayAllowedGradesLabel}만 신청할 수 있습니다.`;

  const toggleSlot = (slot: number) => {
    setSelectedSlots((current) =>
      current.includes(slot)
        ? current.filter((value) => value !== slot)
        : [...current, slot].sort((a, b) => a - b),
    );
  };

  return (
    <div className="space-y-4">
      <div
        className="rounded-2xl border p-4 text-sm"
        style={{
          backgroundColor: "var(--surface)",
          borderColor: "var(--border)",
          color: "var(--foreground)",
        }}
      >
        <div className="flex items-start gap-3">
          <Clock className="mt-0.5 h-5 w-5 shrink-0" style={{ color: "var(--accent)" }} />
          <div className="flex-1 space-y-3">
            <div className="space-y-1">
              <p className="font-semibold">기상곡 신청 안내</p>
              <ul className="list-disc space-y-0.5 pl-4 opacity-80">
                <li>
                  신청 가능 시간: <span className="font-bold">금일 07:00 ~ 명일 05:00전</span>
                </li>
                <li>05:00 ~ 07:00 사이에는 신청과 정산이 잠시 멈추며 신청이 불가합니다.</li>
                <li>
                  오늘 신청 가능 학년:{" "}
                  <span className="font-semibold" style={{ color: "var(--accent)" }}>
                    {todayAllowedGradesLabel}
                  </span>
                </li>
              </ul>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
                요일별 신청 가능 학년
              </p>
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-7">
                {weeklyRules.map((rule) => (
                  <div
                    key={rule.dayOfWeek}
                    className="rounded-xl border px-3 py-2"
                    style={{
                      backgroundColor: rule.isToday ? "var(--surface-2)" : "var(--surface)",
                      borderColor: rule.isToday ? "var(--accent)" : "var(--border)",
                    }}
                  >
                    <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                      {getWeekdayLabel(rule.dayOfWeek)}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: rule.isToday ? "var(--accent)" : "var(--muted)" }}>
                      {rule.label}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {isBreakTime ? (
        <div className="flex items-center gap-2 text-sm text-rose-400">
          <AlertCircle className="h-4 w-4" />
          지금은 기상곡 정산 시간대입니다. 07:00 이후 다시 신청해 주세요.
        </div>
      ) : null}

      {!isAllowedGrade && !isBreakTime ? (
        <div className="flex items-center gap-2 text-sm text-amber-400">
          <AlertCircle className="h-4 w-4" />
          오늘은 {todayAllowedGradesLabel}만 신청할 수 있습니다.
        </div>
      ) : null}

      <form
        ref={formRef}
        action={async (formData) => {
          try {
            await requestSong(formData);
            formRef.current?.reset();
            setSelectedSlots([]);
            toast.success("기상곡 신청을 완료했습니다.");
          } catch (error: any) {
            toast.error(error.message || "신청 중 오류가 발생했습니다.");
          }
        }}
        className={`glass rounded-2xl border p-4 transition-colors ${
          isFormLocked ? "opacity-80" : ""
        }`}
        style={{
          borderColor: isFormLocked ? "color-mix(in srgb, var(--border) 85%, #94a3b8 15%)" : "var(--border)",
          backgroundColor: isFormLocked ? "color-mix(in srgb, var(--surface-2) 82%, var(--surface) 18%)" : undefined,
        }}
      >
        <fieldset
          disabled={isFormLocked}
          title={isFormLocked ? lockedMessage : undefined}
          className={`space-y-4 ${isFormLocked ? "cursor-not-allowed" : ""}`}
        >
          <div className="grid gap-4 lg:grid-cols-[1.2fr,0.8fr]">
            <div className="space-y-4">
              <div className="relative">
                <Search
                  className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2"
                  style={{ color: "var(--muted)" }}
                />
                <input
                  name="youtubeUrl"
                  type="url"
                  placeholder="YouTube URL을 입력해 주세요."
                  className="w-full rounded-xl border py-2 pl-10 pr-4 focus:outline-none"
                  style={{
                    backgroundColor: isFormLocked ? "var(--surface-2)" : "var(--surface)",
                    borderColor: isFormLocked ? "color-mix(in srgb, var(--border) 90%, #94a3b8 10%)" : "var(--border)",
                    color: isFormLocked ? "var(--muted)" : "var(--foreground)",
                    cursor: isFormLocked ? "not-allowed" : "text",
                  }}
                  required
                />
              </div>

              <input
                name="videoTitle"
                type="text"
                placeholder="제목 (선택)"
                className="w-full rounded-xl border px-4 py-2 focus:outline-none"
              style={{
                  backgroundColor: isFormLocked ? "var(--surface-2)" : "var(--surface)",
                  borderColor: isFormLocked ? "color-mix(in srgb, var(--border) 90%, #94a3b8 10%)" : "var(--border)",
                  color: isFormLocked ? "var(--muted)" : "var(--foreground)",
                  cursor: isFormLocked ? "not-allowed" : "text",
                }}
              />
            </div>

            <div className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                  희망 순서
                </div>
                <div className="space-y-2">
                  {SONG_SLOT_ROWS.map((row) => (
                    <div key={row[0].rowLabel} className="grid grid-cols-3 gap-2">
                      {row.map((slot) => {
                        const checked = selectedSlots.includes(slot.slot);

                        return (
                          <label
                            key={slot.slot}
                            className={isFormLocked ? "cursor-not-allowed" : "cursor-pointer"}
                            title={isFormLocked ? lockedMessage : undefined}
                          >
                            <input
                              type="checkbox"
                              name="preferredSlots"
                              value={slot.slot}
                              checked={checked}
                              onChange={() => toggleSlot(slot.slot)}
                              className="sr-only"
                            />
                            <span
                              className="flex items-center justify-center rounded-xl border px-3 py-3 text-sm font-semibold transition-colors"
                              style={{
                                borderColor: isFormLocked
                                  ? "color-mix(in srgb, var(--border) 90%, #94a3b8 10%)"
                                  : checked
                                    ? "var(--accent)"
                                    : "var(--border)",
                                backgroundColor: isFormLocked
                                  ? "color-mix(in srgb, var(--surface-2) 88%, var(--surface) 12%)"
                                  : checked
                                    ? "var(--surface-2)"
                                    : "var(--surface)",
                                color: isFormLocked
                                  ? "var(--muted)"
                                  : checked
                                    ? "var(--accent)"
                                    : "var(--foreground)",
                                cursor: isFormLocked ? "not-allowed" : "pointer",
                              }}
                            >
                              {slot.buttonLabel}
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  ))}
                </div>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  선택하지 않으면 남은 자리 중 앞 순서부터 자동 배치됩니다.
                </p>
              </div>

              <label
                className={`flex items-center gap-2 text-sm ${isFormLocked ? "cursor-not-allowed" : ""}`}
                style={{ color: "var(--muted)" }}
                title={isFormLocked ? lockedMessage : undefined}
              >
                <input
                  type="checkbox"
                  id="isAnonymous"
                  name="isAnonymous"
                  className="h-4 w-4 rounded"
                  style={{ cursor: isFormLocked ? "not-allowed" : "pointer" }}
                />
                익명으로 신청하기
              </label>
            </div>
          </div>

          <button
            type="submit"
            disabled={isFormLocked}
            title={isFormLocked ? lockedMessage : undefined}
            className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-xl px-6 py-3 font-medium transition-colors disabled:cursor-not-allowed"
            style={{
              backgroundColor: isFormLocked ? "var(--border)" : "var(--accent)",
              color: isFormLocked ? "var(--foreground)" : "var(--brand-sub)",
              opacity: isFormLocked ? 0.6 : 1,
            }}
          >
            <Plus className="h-4 w-4" />
            <span>신청하기</span>
          </button>
        </fieldset>
      </form>
    </div>
  );
}
