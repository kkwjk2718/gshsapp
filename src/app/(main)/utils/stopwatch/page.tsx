"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowLeft, Clock3, Flag, Pause, Play, RotateCcw } from "lucide-react";

import { formatClock } from "../time-format";

type LapRecord = {
  id: number;
  totalMs: number;
  lapMs: number;
};

export default function StopwatchPage() {
  const [elapsedMs, setElapsedMs] = useState(0);
  const [isRunning, setIsRunning] = useState(false);
  const [laps, setLaps] = useState<LapRecord[]>([]);
  const startAtRef = useRef<number | null>(null);
  const offsetRef = useRef(0);
  const lapIdRef = useRef(1);

  useEffect(() => {
    if (!isRunning || startAtRef.current === null) {
      return;
    }

    const timer = window.setInterval(() => {
      setElapsedMs(Date.now() - startAtRef.current!);
    }, 50);

    return () => window.clearInterval(timer);
  }, [isRunning]);

  const fastestLapId = useMemo(() => {
    if (laps.length <= 1) {
      return null;
    }

    return laps.reduce((fastest, current) => (
      current.lapMs < fastest.lapMs ? current : fastest
    )).id;
  }, [laps]);

  const slowestLapId = useMemo(() => {
    if (laps.length <= 1) {
      return null;
    }

    return laps.reduce((slowest, current) => (
      current.lapMs > slowest.lapMs ? current : slowest
    )).id;
  }, [laps]);

  const handleStart = () => {
    startAtRef.current = Date.now() - offsetRef.current;
    setIsRunning(true);
  };

  const handlePause = () => {
    offsetRef.current = elapsedMs;
    setIsRunning(false);
  };

  const handleReset = () => {
    startAtRef.current = null;
    offsetRef.current = 0;
    lapIdRef.current = 1;
    setIsRunning(false);
    setElapsedMs(0);
    setLaps([]);
  };

  const handleLap = () => {
    if (!isRunning) {
      return;
    }

    setLaps((current) => {
      const previousTotal = current[0]?.totalMs ?? 0;
      const nextLap: LapRecord = {
        id: lapIdRef.current++,
        totalMs: elapsedMs,
        lapMs: elapsedMs - previousTotal,
      };
      return [nextLap, ...current];
    });
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
        <div className="rounded-full bg-amber-100 p-3 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400">
          <Clock3 className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">스톱워치</h1>
          <p className="text-slate-500">경과 시간을 재고 랩 기록을 남겨 활동이나 측정 시간을 추적합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_0.95fr]">
        <div className="glass rounded-3xl p-6">
          <div className="mb-6 flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">실시간 측정</h2>
              <p className="text-sm text-slate-500 dark:text-slate-400">랩 버튼으로 구간 시간을 바로 남길 수 있습니다.</p>
            </div>
            <span
              className="rounded-full px-3 py-1 text-xs font-medium"
              style={{
                backgroundColor: isRunning ? "rgba(245, 158, 11, 0.16)" : "var(--surface-2)",
                color: isRunning ? "#d97706" : "var(--muted)",
              }}
            >
              {isRunning ? "측정 중" : "대기 중"}
            </span>
          </div>

          <div className="rounded-3xl border border-slate-200/80 bg-white/70 p-6 text-center dark:border-slate-800 dark:bg-slate-900/60">
            <div className="text-xs font-medium tracking-[0.2em] text-slate-400">ELAPSED TIME</div>
            <div className="mt-3 text-5xl font-bold tracking-[-0.04em] text-slate-900 dark:text-slate-100 md:text-6xl">
              {formatClock(elapsedMs, true)}
            </div>
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
                {elapsedMs > 0 ? "이어하기" : "시작"}
              </button>
            )}

            <button
              type="button"
              onClick={handleLap}
              disabled={!isRunning}
              className="inline-flex items-center justify-center gap-2 rounded-2xl border px-4 py-3 font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            >
              <Flag className="h-4 w-4" />
              랩 기록
            </button>

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
        </div>

        <div className="glass rounded-3xl p-6">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">랩 기록</h2>
            <span className="text-sm text-slate-500 dark:text-slate-400">{laps.length}개</span>
          </div>

          {laps.length > 0 ? (
            <div className="space-y-3">
              {laps.map((lap, index) => {
                const isFastest = lap.id === fastestLapId;
                const isSlowest = lap.id === slowestLapId;

                return (
                  <div
                    key={lap.id}
                    className="rounded-2xl border p-4"
                    style={{
                      backgroundColor: "var(--surface)",
                      borderColor: "var(--border)",
                    }}
                  >
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          랩 {laps.length - index}
                        </div>
                        <div className="mt-1 text-xs text-slate-500 dark:text-slate-400">
                          총 경과 {formatClock(lap.totalMs, true)}
                        </div>
                      </div>

                      <div className="text-right">
                        <div className="text-lg font-bold text-slate-900 dark:text-slate-100">
                          {formatClock(lap.lapMs, true)}
                        </div>
                        {isFastest ? (
                          <div className="mt-1 text-xs font-medium text-emerald-600">가장 빠름</div>
                        ) : null}
                        {isSlowest ? (
                          <div className="mt-1 text-xs font-medium text-rose-500">가장 느림</div>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="flex min-h-[18rem] flex-col items-center justify-center gap-3 rounded-3xl border border-dashed border-slate-200 text-center text-slate-400 dark:border-slate-700">
              <Clock3 className="h-10 w-10 opacity-30" />
              <p>스톱워치를 시작한 뒤 랩 기록 버튼을 눌러 구간 시간을 남겨보세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
