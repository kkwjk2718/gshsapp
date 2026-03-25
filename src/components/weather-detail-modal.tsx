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
import type { WeatherData } from "@/lib/weather";

function getWeatherIcon(code: number, size = "w-5 h-5") {
  if (code <= 1) return <Sun className={`${size} text-orange-500`} />;
  if (code <= 3) return <Cloud className={`${size} text-slate-500`} />;
  if (code <= 48) return <Cloud className={`${size} text-slate-500 dark:text-slate-400`} />;
  if (code <= 67) return <CloudRain className={`${size} text-blue-500`} />;
  if (code <= 77) return <CloudSnow className={`${size} text-sky-400 dark:text-sky-200`} />;
  if (code <= 82) return <CloudRain className={`${size} text-blue-600`} />;
  if (code <= 86) return <CloudSnow className={`${size} text-sky-500 dark:text-sky-300`} />;
  if (code <= 99) return <CloudLightning className={`${size} text-amber-400`} />;
  return <Sun className={`${size} text-orange-500`} />;
}

function getWeatherDescription(code: number): string {
  if (code === 0) return "맑음";
  if (code === 1) return "대체로 맑음";
  if (code === 2) return "부분적으로 흐림";
  if (code === 3) return "흐림";
  if (code <= 48) return "안개";
  if (code <= 55) return "이슬비";
  if (code <= 67) return "비";
  if (code <= 77) return "눈";
  if (code <= 82) return "소나기";
  if (code <= 86) return "눈보라";
  if (code <= 99) return "뇌우";
  return "맑음";
}

interface WeatherDetailModalProps {
  weather: WeatherData;
}

export function WeatherDetailModal({ weather }: WeatherDetailModalProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex min-h-10 items-center gap-2 rounded-full border px-3 py-2 transition-all hover:brightness-95 active:brightness-90"
        style={{
          backgroundColor: "color-mix(in srgb, var(--surface-2) 68%, var(--surface) 32%)",
          borderColor: "color-mix(in srgb, var(--border) 78%, var(--accent) 22%)",
          color: "var(--foreground)",
        }}
      >
        {getWeatherIcon(weather.code)}
        <div className="text-sm font-semibold">{weather.temp}°</div>
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
              {getWeatherIcon(weather.code, "w-12 h-12")}
              <span className="text-4xl font-bold text-[var(--foreground)]">{weather.temp}°</span>
              <span className="text-sm text-[var(--muted)]">{getWeatherDescription(weather.code)}</span>
            </div>

            <div className="h-px w-full bg-[var(--border)]" />

            <div className="grid w-full grid-cols-2 gap-3">
              <div className="flex items-center gap-2 rounded-xl bg-blue-100 px-3 py-2.5 dark:bg-blue-500/20">
                <TrendingDown className="h-4 w-4 shrink-0 text-blue-400" />
                <div>
                  <div className="text-xs text-[var(--muted)]">최저</div>
                  <div className="text-sm font-semibold text-[var(--foreground)]">{weather.minTemp}°</div>
                </div>
              </div>

              <div className="flex items-center gap-2 rounded-xl bg-orange-100 px-3 py-2.5 dark:bg-orange-500/20">
                <TrendingUp className="h-4 w-4 shrink-0 text-orange-400" />
                <div>
                  <div className="text-xs text-[var(--muted)]">최고</div>
                  <div className="text-sm font-semibold text-[var(--foreground)]">{weather.maxTemp}°</div>
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
