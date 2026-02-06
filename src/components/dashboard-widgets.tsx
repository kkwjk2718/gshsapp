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
