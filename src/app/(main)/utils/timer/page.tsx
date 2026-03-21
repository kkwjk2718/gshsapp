"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Pause, Play, RotateCcw, Timer } from "lucide-react";
import { toast } from "sonner";

import { formatClock } from "../time-format";

const PRESETS = [
  { label: "1분", minutes: 1, seconds: 0 },
  { label: "3분", minutes: 3, seconds: 0 },
  { label: "5분", minutes: 5, seconds: 0 },
  { label: "10분", minutes: 10, seconds: 0 },
];

function toDurationMs(minutesText: string, secondsText: string) {
  const minutes = Math.max(0, Number.parseInt(minutesText || "0", 10) || 0);
  const seconds = Math.max(0, Number.parseInt(secondsText || "0", 10) || 0);
  return (minutes * 60 + seconds) * 1000;
}

export default function TimerPage() {
  const [minutesText, setMinutesText] = useState("05");
  const [secondsText, setSecondsText] = useState("00");
  const [initialDurationMs, setInitialDurationMs] = useState(5 * 60 * 1000);
  const [remainingMs, setRemainingMs] = useState(5 * 60 * 1000);
  const [isRunning, setIsRunning] = useState(false);
  const [completed, setCompleted] = useState(false);
  const endTimeRef = useRef<number | null>(null);

  const totalDurationMs = useMemo(
    () => toDurationMs(minutesText, secondsText),
    [minutesText, secondsText],
  );

  useEffect(() => {
    if (isRunning) {
      return;
    }

    setInitialDurationMs(totalDurationMs);
    setRemainingMs(totalDurationMs);
    setCompleted(false);
  }, [isRunning, totalDurationMs]);

  useEffect(() => {
    if (!isRunning || endTimeRef.current === null) {
      return;
    }

    const timer = window.setInterval(() => {
      const nextRemaining = Math.max(0, endTimeRef.current! - Date.now());
      setRemainingMs(nextRemaining);

      if (nextRemaining <= 0) {
        window.clearInterval(timer);
        endTimeRef.current = null;
        setIsRunning(false);
        setCompleted(true);
        toast.success("타이머가 종료되었습니다.");
      }
    }, 100);

    return () => window.clearInterval(timer);
  }, [isRunning]);

  const progress = initialDurationMs > 0
    ? Math.min(100, Math.max(0, ((initialDurationMs - remainingMs) / initialDurationMs) * 100))
    : 0;

  const handleStart = () => {
    if (remainingMs <= 0) {
      const nextDuration = totalDurationMs;
      if (nextDuration <= 0) {
        toast.error("1초 이상 설정해 주세요.");
        return;
      }
      setInitialDurationMs(nextDuration);
      setRemainingMs(nextDuration);
      endTimeRef.current = Date.now() + nextDuration;
    } else {
      endTimeRef.current = Date.now() + remainingMs;
    }

    setCompleted(false);
    setIsRunning(true);
  };

  const handlePause = () => {
    if (!isRunning || endTimeRef.current === null) {
      return;
    }

    setRemainingMs(Math.max(0, endTimeRef.current - Date.now()));
    endTimeRef.current = null;
    setIsRunning(false);
  };

  const handleReset = () => {
    const resetMs = totalDurationMs;
    endTimeRef.current = null;
    setIsRunning(false);
    setCompleted(false);
    setInitialDurationMs(resetMs);
    setRemainingMs(resetMs);
  };

  const applyPreset = (minutes: number, seconds: number) => {
    if (isRunning) {
      return;
    }

    const nextMinutes = String(minutes).padStart(2, "0");
    const nextSeconds = String(seconds).padStart(2, "0");
    const nextDuration = (minutes * 60 + seconds) * 1000;

    setMinutesText(nextMinutes);
    setSecondsText(nextSeconds);
    setInitialDurationMs(nextDuration);
    setRemainingMs(nextDuration);
    setCompleted(false);
  };

  return (
    <div className="mobile-page mobile-safe-bottom mx-auto max-w-5xl space-y-6">
      <div className="mb-6 flex items-center gap-3">
        <Link
          href="/utils"
          aria-label="도구 모음으로 돌아가기"
          className="tap-target -ml-2 mr-2 rounded-full p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800"
        >
          <ArrowLeft className="h-5 w-5 text-slate-500" />
        </Link>
        <div className="rounded-full bg-emerald-100 p-3 text-emerald-600 dark:bg-emerald-900/30 dark:text-emerald-400">
          <Timer className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">타이머</h1>
          <p className="text-slate-500">집중 시간, 발표 시간, 쉬는 시간을 빠르게 설정해 카운트다운합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="glass rounded-3xl p-6">
          <div className="mb-6 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">카운트다운</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">시작 후에는 일시정지와 재시작을 반복할 수 있습니다.</p>
            </div>
            <span
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: completed ? "rgba(16, 185, 129, 0.16)" : "var(--surface-2)",
                color: completed ? "#059669" : "var(--muted)",
              }}
            >
              {completed ? "완료" : isRunning ? "진행 중" : "대기 중"}
            </span>
          </div>

          <div className="mb-5 overflow-hidden rounded-3xl border border-slate-200/80 bg-white/70 p-6 text-center dark:border-slate-800 dark:bg-slate-900/60">
            <div className="text-xs font-medium tracking-[0.2em] text-slate-400">TIME LEFT</div>
            <div className="mt-3 text-5xl font-bold tracking-[-0.04em] text-slate-900 dark:text-slate-100 md:text-6xl">
              {formatClock(remainingMs)}
            </div>
            <div className="mt-6 h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <div
                className="h-full rounded-full bg-emerald-500 transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
            {PRESETS.map((preset) => (
              <button
                key={preset.label}
                type="button"
                onClick={() => applyPreset(preset.minutes, preset.seconds)}
                disabled={isRunning}
                className="rounded-2xl border px-4 py-3 text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
                style={{
                  backgroundColor: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>

        <div className="glass rounded-3xl p-6">
          <h2 className="mb-4 text-lg font-bold text-slate-900 dark:text-slate-100">설정</h2>

          <div className="grid grid-cols-2 gap-4">
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">분</span>
              <input
                type="number"
                min="0"
                max="999"
                value={minutesText}
                onChange={(event) => setMinutesText(event.target.value)}
                disabled={isRunning}
                className="w-full rounded-2xl border bg-slate-50 px-4 py-3 text-lg font-semibold outline-none transition focus:ring-2 focus:ring-emerald-500 dark:bg-slate-900"
              />
            </label>
            <label className="space-y-2">
              <span className="text-sm font-medium text-slate-600 dark:text-slate-300">초</span>
              <input
                type="number"
                min="0"
                max="59"
                value={secondsText}
                onChange={(event) => setSecondsText(event.target.value)}
                disabled={isRunning}
                className="w-full rounded-2xl border bg-slate-50 px-4 py-3 text-lg font-semibold outline-none transition focus:ring-2 focus:ring-emerald-500 dark:bg-slate-900"
              />
            </label>
          </div>

          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
            {isRunning ? (
              <button
                type="button"
                onClick={handlePause}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-amber-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-amber-600"
              >
                <Pause className="h-4 w-4" />
                일시정지
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStart}
                className="inline-flex items-center justify-center gap-2 rounded-2xl bg-emerald-500 px-4 py-3 font-semibold text-white transition-colors hover:bg-emerald-600"
              >
                <Play className="h-4 w-4" />
                {remainingMs > 0 && remainingMs !== initialDurationMs ? "재시작" : "시작"}
              </button>
            )}

            <button
              type="button"
              onClick={handleReset}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 font-semibold transition-colors"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            >
              <RotateCcw className="h-4 w-4" />
              초기화
            </button>
          </div>

          <div className="mt-6 rounded-2xl bg-slate-50 p-4 text-sm text-slate-500 dark:bg-slate-900/70 dark:text-slate-400">
            <p>타이머가 끝나면 화면 알림이 표시됩니다.</p>
            <p className="mt-2">분이나 초를 수정하면 대기 상태에서 즉시 새 시간으로 반영됩니다.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
