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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type { WeatherData } from "@/lib/weather";

function getWeatherIcon(code: number, size = "h-5 w-5") {
  if (code <= 1) return <Sun className={`${size} text-orange-400`} />;
  if (code <= 48) return <Cloud className={`${size} text-slate-400`} />;
  if (code <= 67) return <CloudRain className={`${size} text-sky-400`} />;
  if (code <= 86) return <CloudSnow className={`${size} text-cyan-300`} />;
  if (code <= 99) return <CloudLightning className={`${size} text-amber-300`} />;
  return <Sun className={`${size} text-orange-400`} />;
}

function getWeatherDescription(code: number) {
  if (code === 0) return "맑음";
  if (code === 1) return "대체로 맑음";
  if (code === 2) return "부분적으로 흐림";
  if (code === 3) return "흐림";
  if (code <= 48) return "안개";
  if (code <= 55) return "이슬비";
  if (code <= 67) return "비";
  if (code <= 77) return "눈";
  if (code <= 82) return "소나기";
  if (code <= 86) return "폭설";
  if (code <= 99) return "뇌우";
  return "맑음";
}

export function WeatherDetailModal({ weather }: { weather: WeatherData }) {
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
        {getWeatherIcon(weather.code)}
        <div className="text-sm font-semibold">{weather.temp}°C</div>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          className="max-w-sm rounded-[1.75rem] border p-0"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--surface) 94%, transparent), color-mix(in srgb, var(--surface-2) 96%, transparent))",
            borderColor: "color-mix(in srgb, var(--border) 82%, var(--accent) 18%)",
            color: "var(--foreground)",
          }}
        >
          <div className="p-6">
            <DialogHeader>
              <DialogTitle className="text-center text-base font-semibold tracking-[-0.03em]" style={{ color: "var(--foreground)" }}>
                오늘의 날씨
              </DialogTitle>
            </DialogHeader>

            <div className="mt-5 flex flex-col items-center gap-4">
              <div className="flex flex-col items-center gap-1">
                {getWeatherIcon(weather.code, "h-12 w-12")}
                <span className="text-4xl font-semibold tracking-[-0.05em]">{weather.temp}°C</span>
                <span className="text-sm" style={{ color: "var(--muted)" }}>
                  {getWeatherDescription(weather.code)}
                </span>
              </div>

              <div
                className="grid w-full gap-3 sm:grid-cols-2"
              >
                <div className="glass-muted flex items-center gap-3 px-4 py-4">
                  <TrendingDown className="h-4 w-4 shrink-0 text-sky-400" />
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
                      최저
                    </div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                      {weather.minTemp}°C
                    </div>
                  </div>
                </div>

                <div className="glass-muted flex items-center gap-3 px-4 py-4">
                  <TrendingUp className="h-4 w-4 shrink-0 text-orange-300" />
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
                      최고
                    </div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                      {weather.maxTemp}°C
                    </div>
                  </div>
                </div>

                <div className="glass-muted flex items-center gap-3 px-4 py-4 sm:col-span-2">
                  <Droplets className="h-4 w-4 shrink-0 text-cyan-300" />
                  <div>
                    <div className="text-[11px] font-semibold uppercase tracking-[0.14em]" style={{ color: "var(--muted)" }}>
                      내일 강수 확률
                    </div>
                    <div className="mt-1 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                      {weather.tomorrowRainProb}%
                    </div>
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
