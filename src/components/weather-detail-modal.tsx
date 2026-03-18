"use client";

import { useState } from "react";
import { Sun, Cloud, CloudRain, CloudSnow, CloudLightning, Moon, Thermometer, TrendingDown, TrendingUp, Droplets } from "lucide-react";
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
} from "@/components/ui/dialog";
import type { WeatherData } from "@/lib/weather";

function getWeatherIcon(code: number, size: string = "w-5 h-5") {
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
                className="flex items-center gap-2 glass px-3 py-2 rounded-xl hover:brightness-95 active:brightness-90 transition-all"
            >
                {getWeatherIcon(weather.code)}
                <div className="text-sm font-bold text-slate-800 dark:text-slate-200">{weather.temp}°</div>
            </button>

            <Dialog open={open} onOpenChange={setOpen}>
                <DialogContent className="max-w-xs rounded-2xl">
                    <DialogHeader>
                        <DialogTitle className="text-center text-base font-semibold text-slate-700 dark:text-slate-200">
                            오늘의 날씨
                        </DialogTitle>
                    </DialogHeader>

                    <div className="flex flex-col items-center gap-4 py-2">
                        {/* 현재 날씨 */}
                        <div className="flex flex-col items-center gap-1">
                            {getWeatherIcon(weather.code, "w-12 h-12")}
                            <span className="text-4xl font-bold text-slate-800 dark:text-slate-100">
                                {weather.temp}°
                            </span>
                            <span className="text-sm text-slate-500 dark:text-slate-400">
                                {getWeatherDescription(weather.code)}
                            </span>
                        </div>

                        <div className="w-full h-px bg-slate-200 dark:bg-slate-700" />

                        {/* 상세 정보 */}
                        <div className="w-full grid grid-cols-2 gap-3">
                            <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-900/20 rounded-xl px-3 py-2.5">
                                <TrendingDown className="w-4 h-4 text-blue-400 shrink-0" />
                                <div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">최저</div>
                                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                        {weather.minTemp}°
                                    </div>
                                </div>
                            </div>

                            <div className="flex items-center gap-2 bg-orange-50 dark:bg-orange-900/20 rounded-xl px-3 py-2.5">
                                <TrendingUp className="w-4 h-4 text-orange-400 shrink-0" />
                                <div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">최고</div>
                                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                        {weather.maxTemp}°
                                    </div>
                                </div>
                            </div>

                            <div className="col-span-2 flex items-center gap-2 bg-sky-50 dark:bg-sky-900/20 rounded-xl px-3 py-2.5">
                                <Droplets className="w-4 h-4 text-sky-500 shrink-0" />
                                <div>
                                    <div className="text-xs text-slate-500 dark:text-slate-400">내일 강수 확률</div>
                                    <div className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                        {weather.tomorrowRainProb}%
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
