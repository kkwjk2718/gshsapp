"use client";

import { useState } from "react";
import { Copy, Dices, RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { UtilsBackLink } from "../utils-back-link";

export default function RandomNumberPage() {
  const [min, setMin] = useState<string>("1");
  const [max, setMax] = useState<string>("100");
  const [count, setCount] = useState<string>("1");
  const [exclude, setExclude] = useState<string>("");
  const [allowDuplicate, setAllowDuplicate] = useState<boolean>(false);
  const [results, setResults] = useState<number[]>([]);
  const [isAnimating, setIsAnimating] = useState(false);

  const generateNumbers = () => {
    const minNum = parseInt(min, 10);
    const maxNum = parseInt(max, 10);
    const countNum = parseInt(count, 10);

    if (Number.isNaN(minNum) || Number.isNaN(maxNum) || Number.isNaN(countNum)) {
      toast.error("올바른 숫자를 입력해 주세요.");
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

    const excludedNums = exclude
      .split(",")
      .map((value) => parseInt(value.trim(), 10))
      .filter((value) => !Number.isNaN(value));

    const validExcludedNums = excludedNums.filter((value) => value >= minNum && value <= maxNum);
    const uniqueExcludedNums = [...new Set(validExcludedNums)];

    const rangeSize = maxNum - minNum + 1;
    const availableSize = rangeSize - uniqueExcludedNums.length;

    if (availableSize < countNum && !allowDuplicate) {
      toast.error(
        `제외한 숫자를 빼고 뽑을 수 있는 숫자가 부족합니다. (가능: ${availableSize}개)`,
      );
      return;
    }

    if (availableSize <= 0) {
      toast.error("범위 안의 모든 숫자가 제외되었습니다.");
      return;
    }

    setIsAnimating(true);
    setResults([]);

    const duration = 500;
    const intervalTime = 50;
    const steps = duration / intervalTime;
    let step = 0;

    const timer = window.setInterval(() => {
      step += 1;
      const tempResults: number[] = [];
      for (let index = 0; index < countNum; index += 1) {
        tempResults.push(Math.floor(Math.random() * (maxNum - minNum + 1)) + minNum);
      }
      setResults(tempResults);

      if (step >= steps) {
        window.clearInterval(timer);
        setIsAnimating(false);

        const nextResults: number[] = [];
        const pool = Array.from({ length: rangeSize }, (_, index) => minNum + index).filter(
          (value) => !uniqueExcludedNums.includes(value),
        );

        if (allowDuplicate) {
          for (let index = 0; index < countNum; index += 1) {
            const randomIndex = Math.floor(Math.random() * pool.length);
            nextResults.push(pool[randomIndex]);
          }
        } else {
          for (let index = 0; index < countNum; index += 1) {
            const randomIndex = Math.floor(Math.random() * pool.length);
            nextResults.push(pool[randomIndex]);
            pool.splice(randomIndex, 1);
          }
        }

        setResults(nextResults);
      }
    }, intervalTime);
  };

  const copyResults = () => {
    if (results.length === 0) {
      return;
    }

    navigator.clipboard.writeText(results.join(", "));
    toast.success("결과를 복사했습니다.");
  };

  return (
    <div className="mobile-page mobile-safe-bottom mx-auto max-w-4xl space-y-6">
      <div className="mb-6 flex items-center gap-3">
        <UtilsBackLink />
        <div className="rounded-full bg-purple-100 p-3 text-purple-600 dark:bg-purple-900/30">
          <Dices className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">랜덤 숫자 뽑기</h1>
          <p className="text-slate-500">지정한 범위 안에서 무작위 숫자를 생성합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-3">
        <div className="glass h-fit space-y-6 rounded-3xl p-6 md:col-span-1">
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  최소값
                </label>
                <input
                  type="number"
                  value={min}
                  onChange={(event) => setMin(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                  최대값
                </label>
                <input
                  type="number"
                  value={max}
                  onChange={(event) => setMax(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900"
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">개수</label>
              <input
                type="number"
                min="1"
                max="500"
                value={count}
                onChange={(event) => setCount(event.target.value)}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">
                제외할 번호 <span className="text-xs font-normal text-slate-400">(쉼표로 구분)</span>
              </label>
              <input
                type="text"
                value={exclude}
                onChange={(event) => setExclude(event.target.value)}
                placeholder="예: 1, 5, 7"
                className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-2 focus:outline-none focus:ring-2 focus:ring-purple-500 dark:border-slate-700 dark:bg-slate-900"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="duplicate"
                type="checkbox"
                checked={allowDuplicate}
                onChange={(event) => setAllowDuplicate(event.target.checked)}
                className="h-4 w-4 rounded border-slate-300 text-purple-600 focus:ring-purple-500"
              />
              <label
                htmlFor="duplicate"
                className="cursor-pointer select-none text-sm text-slate-600 dark:text-slate-400"
              >
                중복 허용
              </label>
            </div>
          </div>

          <button
            onClick={generateNumbers}
            disabled={isAnimating}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-purple-600 py-3 font-bold text-white shadow-lg shadow-purple-500/20 transition-all active:scale-95 hover:bg-purple-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <RefreshCw className={`h-5 w-5 ${isAnimating ? "animate-spin" : ""}`} />
            {isAnimating ? "뽑는 중..." : "숫자 뽑기"}
          </button>
        </div>

        <div className="glass flex min-h-[300px] flex-col rounded-3xl p-6 md:col-span-2">
          <div className="mb-6 flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 dark:text-slate-100">결과</h2>
            {results.length > 0 ? (
              <button
                onClick={copyResults}
                className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-slate-500 transition-colors hover:text-purple-600"
              >
                <Copy className="h-3 w-3" />
                복사하기
              </button>
            ) : null}
          </div>

          {results.length > 0 ? (
            <div className="flex flex-1 flex-wrap content-start gap-3">
              {results.map((num, index) => (
                <div
                  key={`${num}-${index}`}
                  className="flex h-16 w-16 items-center justify-center rounded-2xl border border-slate-100 bg-white text-2xl font-bold text-slate-800 shadow-sm animate-in zoom-in duration-300 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200"
                  style={{ animationDelay: `${index * 50}ms` }}
                >
                  {num}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-1 flex-col items-center justify-center gap-4 text-slate-400">
              <div className="flex h-16 w-16 items-center justify-center rounded-full bg-slate-100 dark:bg-slate-800">
                <Dices className="h-8 w-8 opacity-50" />
              </div>
              <p>설정을 입력하고 버튼을 눌러 주세요.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
