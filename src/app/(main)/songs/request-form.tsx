"use client";

import { Search, Plus, Clock, AlertCircle } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";

import { requestSong } from "./actions";

type WeeklyRule = {
  dayOfWeek: number;
  label: string;
  isToday: boolean;
};

interface SongRequestFormProps {
  isAllowedGrade: boolean;
  todayAllowedGradesLabel: string;
  weeklyRules: WeeklyRule[];
}

export function SongRequestForm({
  isAllowedGrade,
  todayAllowedGradesLabel,
  weeklyRules,
}: SongRequestFormProps) {
  const formRef = useRef<HTMLFormElement>(null);
  const [isBreakTime, setIsBreakTime] = useState(false);

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

  const isSubmitDisabled = isBreakTime || !isAllowedGrade;

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
                  신청 가능 시간: <span className="font-bold">금일 07:00 ~ 익일 05:00</span>
                </li>
                <li>05:00 ~ 07:00 사이는 신청이 잠시 제한됩니다.</li>
                <li>오늘 신청한 곡은 다음 기상곡에 반영됩니다.</li>
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
              <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-5">
                {weeklyRules.map((rule) => (
                  <div
                    key={rule.dayOfWeek}
                    className="rounded-xl border px-3 py-2"
                    style={{
                      backgroundColor: rule.isToday ? "var(--surface-2)" : "var(--surface)",
                      borderColor: rule.isToday ? "var(--accent)" : "var(--border)",
                    }}
                  >
                    <div className="text-xs font-semibold" style={{ color: rule.isToday ? "var(--accent)" : "var(--muted)" }}>
                      {rule.label === "전체 학년" ? `${rule.label}` : `${rule.label}`}
                    </div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                      {rule.dayOfWeek === 1
                        ? "월요일"
                        : rule.dayOfWeek === 2
                          ? "화요일"
                          : rule.dayOfWeek === 3
                            ? "수요일"
                            : rule.dayOfWeek === 4
                              ? "목요일"
                              : "금요일"}
                    </div>
                    <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
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
          지금은 기상곡 신청 시간대가 아닙니다. 07:00 이후 다시 시도해 주세요.
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
            toast.success("기상곡 신청을 완료했습니다.");
          } catch (error: any) {
            toast.error(error.message || "신청 중 오류가 발생했습니다.");
          }
        }}
        className={`glass flex flex-col gap-4 rounded-2xl p-4 md:flex-row md:items-center ${
          isSubmitDisabled ? "pointer-events-none opacity-50 grayscale" : ""
        }`}
      >
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--muted)" }} />
          <input
            name="youtubeUrl"
            type="url"
            placeholder="YouTube URL을 입력해 주세요."
            className="w-full rounded-xl border py-2 pl-10 pr-4 focus:outline-none"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
            required
            disabled={isSubmitDisabled}
          />
        </div>

        <div className="flex-1 md:max-w-xs">
          <input
            name="videoTitle"
            type="text"
            placeholder="노래 제목 (선택)"
            className="w-full rounded-xl border px-4 py-2 focus:outline-none"
            style={{
              backgroundColor: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--foreground)",
            }}
            disabled={isSubmitDisabled}
          />
        </div>

        <label className="flex items-center gap-2 text-sm" style={{ color: "var(--muted)" }}>
          <input type="checkbox" id="isAnonymous" name="isAnonymous" className="h-4 w-4 rounded" disabled={isSubmitDisabled} />
          익명으로 신청하기
        </label>

        <button
          type="submit"
          disabled={isSubmitDisabled}
          className="flex cursor-pointer items-center justify-center gap-2 rounded-xl px-6 py-2 font-medium transition-colors disabled:cursor-not-allowed"
          style={{
            backgroundColor: isSubmitDisabled ? "var(--border)" : "var(--accent)",
            color: isSubmitDisabled ? "var(--foreground)" : "var(--brand-sub)",
            opacity: isSubmitDisabled ? 0.6 : 1,
          }}
        >
          <Plus className="h-4 w-4" />
          <span>신청하기</span>
        </button>
      </form>
    </div>
  );
}
