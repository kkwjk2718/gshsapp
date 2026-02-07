"use client"

import { useState } from "react";
import { Dices, RefreshCw, Copy, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

export default function RandomNumberPage() {
    const [min, setMin] = useState<string>("1");
    const [max, setMax] = useState<string>("100");
    const [count, setCount] = useState<string>("1");
    const [exclude, setExclude] = useState<string>("");
    const [allowDuplicate, setAllowDuplicate] = useState<boolean>(false);
    const [results, setResults] = useState<number[]>([]);
    const [isAnimating, setIsAnimating] = useState(false);

    const generateNumbers = () => {
        const minNum = parseInt(min);
        const maxNum = parseInt(max);
        const countNum = parseInt(count);

        if (isNaN(minNum) || isNaN(maxNum) || isNaN(countNum)) {
            toast.error("올바른 숫자를 입력해주세요.");
            return;
        }

        if (minNum > maxNum) {
            toast.error("최소값은 최대값보다 클 수 없습니다.");
            return;
        }

        if (countNum < 1) {
            toast.error("개수는 1개 이상이어야 합니다.");
            return;
        }

        if (countNum > 500) {
            toast.error("한 번에 최대 500개까지만 뽑을 수 있습니다.");
            return;
        }

        // Parse excluded numbers
        const excludedNums = exclude
            .split(",")
            .map(s => parseInt(s.trim()))
            .filter(n => !isNaN(n));

        // Filter out excluded numbers that are out of range (optional, but good for logic)
        const validExcludedNums = excludedNums.filter(n => n >= minNum && n <= maxNum);
        // Remove duplicates in exclude list
        const uniqueExcludedNums = [...new Set(validExcludedNums)];

        const rangeSize = maxNum - minNum + 1;
        const availableSize = rangeSize - uniqueExcludedNums.length;

        if (availableSize < countNum && !allowDuplicate) {
            toast.error(`제외된 번호를 빼고 뽑을 수 있는 숫자가 부족합니다. (가능: ${availableSize}개)`);
            return;
        }

        // If duplicates allowed, but all numbers in range are excluded
        if (availableSize <= 0) {
            toast.error("범위 내의 모든 숫자가 제외되었습니다.");
            return;
        }

        setIsAnimating(true);
        setResults([]);

        // Simple animation effect
        const duration = 500;
        const intervalTime = 50;
        const steps = duration / intervalTime;
        let step = 0;

        const timer = setInterval(() => {
            step++;
            const tempResults = [];
            // For animation, pick from the full range, then filter for final
            for (let i = 0; i < countNum; i++) {
                tempResults.push(Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum);
            }
            setResults(tempResults);

            if (step >= steps) {
                clearInterval(timer);
                setIsAnimating(false);

                // Final generation
                const newResults: number[] = [];
                const pool = Array.from({ length: rangeSize }, (_, i) => minNum + i)
                    .filter(n => !uniqueExcludedNums.includes(n));

                if (allowDuplicate) {
                    for (let i = 0; i < countNum; i++) {
                        // Pick randomly from the filtered pool
                        const randomIndex = Math.floor(Math.random() * pool.length);
                        newResults.push(pool[randomIndex]);
                    }
                } else {
                    for (let i = 0; i < countNum; i++) {
                        const randomIndex = Math.floor(Math.random() * pool.length);
                        newResults.push(pool[randomIndex]);
                        pool.splice(randomIndex, 1);
                    }
                }
                setResults(newResults);
            }
        }, intervalTime);
    };

    const copyResults = () => {
        if (results.length === 0) return;
        navigator.clipboard.writeText(results.join(", "));
        toast.success("결과가 복사되었습니다.");
    };

    return (
        <div className="p-4 md:p-8 max-w-4xl mx-auto space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <Link href="/utils" className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors mr-2">
                    <ArrowLeft className="w-5 h-5 text-slate-500" />
                </Link>
                <div className="p-3 bg-purple-100 dark:bg-purple-900/30 rounded-full text-purple-600">
                    <Dices className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">랜덤 숫자 뽑기</h1>
                    <p className="text-slate-500">지정된 범위 내에서 무작위 숫자를 생성합니다.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {/* Controls */}
                <div className="md:col-span-1 glass p-6 rounded-3xl space-y-6 h-fit">
                    <div className="space-y-4">
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">최소값</label>
                                <input
                                    type="number"
                                    value={min}
                                    onChange={(e) => setMin(e.target.value)}
                                    className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">최대값</label>
                                <input
                                    type="number"
                                    value={max}
                                    onChange={(e) => setMax(e.target.value)}
                                    className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                                />
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">개수</label>
                            <input
                                type="number"
                                value={count}
                                onChange={(e) => setCount(e.target.value)}
                                min="1"
                                max="500"
                                className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>

                        <div className="space-y-2">
                            <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                                제외할 번호 <span className="text-xs text-slate-400 font-normal">(쉼표로 구분)</span>
                            </label>
                            <input
                                type="text"
                                value={exclude}
                                onChange={(e) => setExclude(e.target.value)}
                                placeholder="예: 1, 5, 7"
                                className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-purple-500"
                            />
                        </div>

                        <div className="flex items-center gap-2">
                            <input
                                type="checkbox"
                                id="duplicate"
                                checked={allowDuplicate}
                                onChange={(e) => setAllowDuplicate(e.target.checked)}
                                className="w-4 h-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
                            />
                            <label htmlFor="duplicate" className="text-sm text-slate-600 dark:text-slate-400 select-none cursor-pointer">
                                중복 허용
                            </label>
                        </div>
                    </div>

                    <button
                        onClick={generateNumbers}
                        disabled={isAnimating}
                        className="w-full py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-xl font-bold shadow-lg shadow-purple-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <RefreshCw className={`w-5 h-5 ${isAnimating ? "animate-spin" : ""}`} />
                        {isAnimating ? "뽑는 중..." : "숫자 뽑기"}
                    </button>
                </div>

                {/* Results */}
                <div className="md:col-span-2 glass p-6 rounded-3xl min-h-[300px] flex flex-col">
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="font-bold text-lg text-slate-900 dark:text-slate-100">결과</h2>
                        {results.length > 0 && (
                            <button
                                onClick={copyResults}
                                className="text-xs flex items-center gap-1 text-slate-500 hover:text-purple-600 px-2 py-1 rounded-lg transition-colors"
                            >
                                <Copy className="w-3 h-3" />
                                복사하기
                            </button>
                        )}
                    </div>

                    {results.length > 0 ? (
                        <div className="flex-1 flex flex-wrap content-start gap-3">
                            {results.map((num, idx) => (
                                <div
                                    key={idx}
                                    className="w-16 h-16 flex items-center justify-center bg-white dark:bg-slate-800 rounded-2xl shadow-sm border border-slate-100 dark:border-slate-700 text-2xl font-bold text-slate-800 dark:text-slate-200 animate-in zoom-in duration-300"
                                    style={{ animationDelay: `${idx * 50}ms` }}
                                >
                                    {num}
                                </div>
                            ))}
                        </div>
                    ) : (
                        <div className="flex-1 flex flex-col items-center justify-center text-slate-400 gap-4">
                            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                                <Dices className="w-8 h-8 opacity-50" />
                            </div>
                            <p>설정을 입력하고 버튼을 눌러주세요</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
