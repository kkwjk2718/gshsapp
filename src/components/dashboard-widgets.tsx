"use client"

import { useState, useEffect } from "react";
import { format } from "date-fns";
import { ko } from "date-fns/locale";
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, Moon } from "lucide-react";

export function RealtimeClock({ compact = false }: { compact?: boolean }) {
  const [time, setTime] = useState<Date | null>(null);

  useEffect(() => {
    setTime(new Date());
    const timer = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  if (!time) return <div className="h-4 w-20 bg-slate-200 dark:bg-slate-800 rounded animate-pulse" />;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs font-medium text-slate-500">{format(time, "M.d (EEE)", { locale: ko })}</span>
        <span className="font-mono font-bold text-lg text-slate-700 dark:text-slate-300">
          {format(time, "HH:mm:ss")}
        </span>
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div className="text-xs text-slate-500 font-medium">{format(time, "M월 d일 EEEE", { locale: ko })}</div>
      <div className="text-2xl font-bold font-mono tracking-tight text-slate-800 dark:text-slate-100">
        {format(time, "HH:mm:ss")}
      </div>
    </div>
  );
}

// Using Open-Meteo API (Free, No Key) for Jinju
// Latitude: 35.1805, Longitude: 128.1087 (Jinju-si)
export function WeatherWidget() {
  const [weather, setWeather] = useState<{ temp: number; code: number } | null>(null);

  useEffect(() => {
    async function fetchWeather() {
      try {
        const res = await fetch(
          "https://api.open-meteo.com/v1/forecast?latitude=35.1805&longitude=128.1087&current_weather=true"
        );
        const data = await res.json();
        if (data.current_weather) {
          setWeather({
            temp: data.current_weather.temperature,
            code: data.current_weather.weathercode
          });
        }
      } catch (e) {
        console.error("Weather fetch error", e);
      }
    }

    fetchWeather();
    // Refresh every 30 mins
    const timer = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(timer);
  }, []);

  if (!weather) return (
    <div className="flex items-center gap-2 text-slate-400 glass px-3 py-2 rounded-xl h-[40px]">
      <div className="w-4 h-4 rounded-full bg-slate-700/50 animate-pulse" />
      <span className="text-xs">...</span>
    </div>
  );

  // WMO Weather interpretation codes (http://www.nodc.noaa.gov/archive/arc0021/0002199/1.1/data/0-data/HTML/WMO-CODE/WMO4677.HTM)
  const getWeatherIcon = (code: number) => {
    if (code <= 1) return <Sun className="w-5 h-5 text-orange-500" />;
    if (code <= 3) return <Cloud className="w-5 h-5 text-slate-500" />;
    if (code <= 48) return <Cloud className="w-5 h-5 text-slate-500 dark:text-slate-400" />; // Fog
    if (code <= 67) return <CloudRain className="w-5 h-5 text-blue-500" />;
    if (code <= 77) return <CloudSnow className="w-5 h-5 text-sky-400 dark:text-sky-200" />;
    if (code <= 82) return <CloudRain className="w-5 h-5 text-blue-600" />;
    if (code <= 86) return <CloudSnow className="w-5 h-5 text-sky-500 dark:text-sky-300" />;
    if (code <= 99) return <CloudLightning className="w-5 h-5 text-amber-400" />;
    return <Sun className="w-5 h-5 text-orange-500" />;
  };

  return (
    <div className="flex items-center gap-2 glass px-3 py-2 rounded-xl">
      {getWeatherIcon(weather.code)}
      <div className="text-sm font-bold text-slate-200">{weather.temp}°</div>
    </div>
  );
}