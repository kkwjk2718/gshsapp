"use client";

import { useState } from "react";
import {
  Cloud,
  CloudLightning,
  CloudRain,
  CloudSnow,
  Droplets,
  Sun,
  TrendingDown,
  TrendingUp,
} from "lucide-react";

import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { WeatherCondition, WeatherData } from "@/lib/weather";

function getWeatherIcon(condition: WeatherCondition, size = "h-5 w-5") {
  switch (condition) {
    case "clear":
      return <Sun className={`${size} text-orange-500`} />;
    case "partly-cloudy":
    case "cloudy":
    case "fog":
      return <Cloud className={`${size} text-slate-500 dark:text-slate-400`} />;
    case "drizzle":
    case "rain":
      return <CloudRain className={`${size} text-blue-500`} />;
    case "snow":
      return <CloudSnow className={`${size} text-sky-500 dark:text-sky-300`} />;
    case "thunder":
      return <CloudLightning className={`${size} text-amber-400`} />;
    default:
      return <Sun className={`${size} text-orange-500`} />;
  }
}

interface WeatherDetailModalProps {
  weather: WeatherData;
}

export function WeatherDetailModal({ weather }: WeatherDetailModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 transition-all hover:brightness-95 active:brightness-90"
        style={{
          backgroundColor: "color-mix(in srgb, var(--surface-2) 68%, var(--surface) 32%)",
          borderColor: "color-mix(in srgb, var(--border) 78%, var(--accent) 22%)",
          color: "var(--foreground)",
        }}
      >
        {getWeatherIcon(weather.condition)}
        <div className="text-sm font-semibold">{weather.temp}℃</div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xs rounded-2xl">
          <DialogHeader>
            <DialogTitle className="text-center text-base font-semibold text-[var(--foreground)]">
              오늘의 날씨
            </DialogTitle>
          </DialogHeader>

          <div className="flex flex-col items-center gap-4 py-2">
            <div className="flex flex-col items-center gap-1">
              {getWeatherIcon(weather.condition, "h-12 w-12")}
              <span className="text-4xl font-bold text-[var(--foreground)]">{weather.temp}℃</span>
              <span className="text-sm text-[var(--muted)]">{weather.description}</span>
              {weather.stale ? (
                <span className="text-[11px] text-[var(--muted)]">최근 저장된 날씨 정보를 표시하고 있습니다.</span>
              ) : null}
            </div>

            <div className="h-px w-full bg-[var(--border)]" />

            <div className="grid w-full grid-cols-2 gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-blue-100 px-3 py-2.5 dark:bg-blue-500/20">
                <TrendingDown className="h-4 w-4 shrink-0 text-blue-400" />
                <div>
                  <div className="text-xs text-[var(--muted)]">최저</div>
                  <div className="text-sm font-semibold text-[var(--foreground)]">{weather.minTemp}℃</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-orange-100 px-3 py-2.5 dark:bg-orange-500/20">
                <TrendingUp className="h-4 w-4 shrink-0 text-orange-400" />
                <div>
                  <div className="text-xs text-[var(--muted)]">최고</div>
                  <div className="text-sm font-semibold text-[var(--foreground)]">{weather.maxTemp}℃</div>
                </div>
              </div>

              <div className="col-span-2 flex items-center gap-2 rounded-xl bg-sky-100 px-3 py-2.5 dark:bg-cyan-500/20">
                <Droplets className="h-4 w-4 shrink-0 text-sky-500" />
                <div>
                  <div className="text-xs text-[var(--muted)]">내일 강수 확률</div>
                  <div className="text-sm font-semibold text-[var(--foreground)]">
                    {weather.tomorrowRainProb !== null ? `${weather.tomorrowRainProb}%` : "-"}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
