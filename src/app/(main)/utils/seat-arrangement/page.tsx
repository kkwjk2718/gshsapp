"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  Armchair,
  Ban,
  Download,
  RefreshCw,
  Settings,
  User,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { toPng } from "html-to-image";

import { UtilsBackLink } from "../utils-back-link";

export default function SeatArrangementPage() {
  const [rows, setRows] = useState<number>(5);
  const [cols, setCols] = useState<number>(6);
  const [voidSeats, setVoidSeats] = useState<Set<string>>(new Set());
  const [isVoidMode, setIsVoidMode] = useState<boolean>(false);

  const [gradeText, setGradeText] = useState<string>("");
  const [classText, setClassText] = useState<string>("");
  const [startNum, setStartNum] = useState<string>("1");
  const [excludedNums, setExcludedNums] = useState<Set<number>>(new Set());
  const [isExcludeMode, setIsExcludeMode] = useState<boolean>(false);

  const [assignments, setAssignments] = useState<Map<string, number>>(new Map());
  const [isAnimating, setIsAnimating] = useState<boolean>(false);

  const effectiveVoidSeats = useMemo(() => {
    const next = new Set<string>();

    voidSeats.forEach((key) => {
      const [rowText, colText] = key.split("-");
      const row = Number.parseInt(rowText, 10);
      const col = Number.parseInt(colText, 10);

      if (row < rows && col < cols) {
        next.add(key);
      }
    });

    return next;
  }, [voidSeats, rows, cols]);

  useEffect(() => {
    setVoidSeats((previous) => {
      if (previous.size === effectiveVoidSeats.size) {
        return previous;
      }

      return new Set(effectiveVoidSeats);
    });
  }, [effectiveVoidSeats]);

  useEffect(() => {
    setAssignments(new Map());
  }, [rows, cols, effectiveVoidSeats, startNum, excludedNums]);

  const totalSeats = rows * cols;
  const validSeatsCount = totalSeats - effectiveVoidSeats.size;
  const normalizedGrade = gradeText.trim();
  const normalizedClass = classText.trim();
  const shouldUseClassPrefix = normalizedGrade !== "" && normalizedClass !== "";

  const formatSeatLabel = (studentNum: number) => {
    if (!shouldUseClassPrefix) {
      return String(studentNum);
    }

    return `${normalizedGrade}${normalizedClass}${String(studentNum).padStart(2, "0")}`;
  };

  const [endNum, setEndNum] = useState<string>("");
  const [isEndNumManual, setIsEndNumManual] = useState<boolean>(false);

  useEffect(() => {
    if (!isEndNumManual) {
      const start = parseInt(startNum, 10) || 1;
      setEndNum(String(start + validSeatsCount - 1));
    }
  }, [validSeatsCount, startNum, isEndNumManual]);

  const handleEndNumChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    setEndNum(event.target.value);
    setIsEndNumManual(true);
  };

  const handleSeatClick = (row: number, col: number) => {
    if (!isVoidMode) {
      return;
    }

    const key = `${row}-${col}`;
    const nextVoidSeats = new Set(effectiveVoidSeats);
    if (nextVoidSeats.has(key)) {
      nextVoidSeats.delete(key);
    } else {
      nextVoidSeats.add(key);
    }
    setVoidSeats(nextVoidSeats);
  };

  const toggleExcludedNum = (num: number) => {
    const nextExcluded = new Set(excludedNums);
    if (nextExcluded.has(num)) {
      nextExcluded.delete(num);
    } else {
      nextExcluded.add(num);
    }
    setExcludedNums(nextExcluded);
  };

  const shuffleSeats = () => {
    const start = parseInt(startNum, 10);
    const end = parseInt(endNum, 10);

    if (Number.isNaN(start) || Number.isNaN(end)) {
      toast.error("번호 범위를 올바르게 입력해 주세요.");
      return;
    }

    const students: number[] = [];
    for (let student = start; student <= end; student += 1) {
      if (!excludedNums.has(student)) {
        students.push(student);
      }
    }

    const studentCount = students.length;
    if (studentCount > validSeatsCount) {
      toast.error(
        `학생 수 ${studentCount}명이 배정 가능한 좌석 수 ${validSeatsCount}석보다 많습니다.`,
      );
      return;
    }

    if (validSeatsCount - studentCount > 5) {
      toast("좌석 수가 학생 수보다 많이 여유롭습니다.", {
        description: "빈 자리가 많이 생길 수 있습니다.",
      });
    }

    setIsAnimating(true);
    setAssignments(new Map());

    let currentInterval = 5;
    let elapsed = 0;
    const totalDuration = 2500 + Math.random() * 1000;

    const availableSeatKeys: string[] = [];
    for (let row = 0; row < rows; row += 1) {
      for (let col = 0; col < cols; col += 1) {
        if (!effectiveVoidSeats.has(`${row}-${col}`)) {
          availableSeatKeys.push(`${row}-${col}`);
        }
      }
    }

    const animate = () => {
      const tempMap = new Map<string, number>();
      const shuffledKeys = [...availableSeatKeys].sort(() => Math.random() - 0.5);

      students.forEach((student, index) => {
        if (index < shuffledKeys.length) {
          tempMap.set(shuffledKeys[index], student);
        }
      });

      setAssignments(tempMap);

      elapsed += currentInterval;
      currentInterval *= 1.1;

      if (elapsed < totalDuration) {
        window.setTimeout(animate, currentInterval);
      } else {
        const finalMap = new Map<string, number>();
        const finalKeys = [...availableSeatKeys].sort(() => Math.random() - 0.5);
        const shuffledStudents = [...students].sort(() => Math.random() - 0.5);

        shuffledStudents.forEach((student, index) => {
          finalMap.set(finalKeys[index], student);
        });

        setAssignments(finalMap);
        setIsAnimating(false);
        toast.success("자리 배치가 완료되었습니다.");
      }
    };

    animate();
  };

  const gridRef = useRef<HTMLDivElement>(null);
  const currentStart = parseInt(startNum, 10) || 1;
  const currentEnd = parseInt(endNum, 10) || 0;
  const potentialStudentList: number[] = [];

  if (currentEnd >= currentStart) {
    for (let student = currentStart; student <= currentEnd; student += 1) {
      potentialStudentList.push(student);
    }
  }

  const realStudentCount = potentialStudentList.filter((student) => !excludedNums.has(student)).length;

  const handleSaveImage = async () => {
    if (!gridRef.current) {
      return;
    }

    try {
      gridRef.current.classList.add("dark");

      const dataUrl = await toPng(gridRef.current, {
        cacheBust: true,
        backgroundColor: "#0f172a",
      });

      gridRef.current.classList.remove("dark");

      const link = document.createElement("a");
      link.download = `자리배치_${new Date().toISOString().slice(0, 10)}.png`;
      link.href = dataUrl;
      link.click();
      toast.success("이미지로 저장했습니다.");
    } catch (error) {
      console.error("Image save failed:", error);
      toast.error("이미지 저장에 실패했습니다.");
      if (gridRef.current) {
        gridRef.current.classList.remove("dark");
      }
    }
  };

  return (
    <div className="mobile-page mobile-safe-bottom mx-auto max-w-6xl space-y-6">
      <div className="mb-6 flex items-center gap-3">
        <UtilsBackLink />
        <div className="rounded-full bg-indigo-100 p-3 text-indigo-600 dark:bg-indigo-900/30">
          <Armchair className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">자리 배치</h1>
          <p className="text-slate-500">교실 좌석을 랜덤으로 배치합니다.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
        <div className="space-y-6 lg:col-span-1">
          <div className="glass space-y-4 rounded-3xl p-5">
            <h2 className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
              <Settings className="h-4 w-4" /> 좌석 설정
            </h2>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>가로 (열)</span>
                <span className="font-mono">{cols}</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={cols}
                onChange={(event) => setCols(parseInt(event.target.value, 10))}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-indigo-600"
              />
            </div>
            <div className="space-y-1">
              <div className="flex justify-between text-sm">
                <span>세로 (행)</span>
                <span className="font-mono">{rows}</span>
              </div>
              <input
                type="range"
                min="1"
                max="10"
                value={rows}
                onChange={(event) => setRows(parseInt(event.target.value, 10))}
                className="h-2 w-full cursor-pointer appearance-none rounded-lg bg-slate-200 accent-indigo-600"
              />
            </div>

            <div className="border-t border-slate-100 pt-2 dark:border-slate-800">
              <button
                onClick={() => setIsVoidMode(!isVoidMode)}
                className={`flex w-full items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-all ${
                  isVoidMode
                    ? "ring-offset-1 bg-rose-600 text-white ring-2 ring-rose-500 shadow-lg shadow-rose-500/30"
                    : "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40"
                }`}
              >
                <Ban className="h-4 w-4" />
                {isVoidMode ? "선택 종료" : "없는 자리 지정하기"}
              </button>
              <p className="mt-2 text-center text-xs text-slate-400">
                {isVoidMode
                  ? "좌석을 클릭하여 사용 안 함 처리하세요."
                  : "버튼을 누르고 빈 공간으로 둘 자리를 클릭하세요."}
              </p>
            </div>
          </div>

          <div className="glass space-y-4 rounded-3xl p-5">
            <h2 className="flex items-center gap-2 font-bold text-slate-700 dark:text-slate-200">
              <User className="h-4 w-4" /> 학생 설정
            </h2>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">학년</label>
                <input
                  type="number"
                  value={gradeText}
                  onChange={(event) => setGradeText(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="예: 1"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">반</label>
                <input
                  type="number"
                  value={classText}
                  onChange={(event) => setClassText(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="예: 3"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">시작 번호</label>
                <input
                  type="number"
                  value={startNum}
                  onChange={(event) => setStartNum(event.target.value)}
                  className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                />
              </div>
              <div className="space-y-1">
                <label className="text-xs text-slate-500 dark:text-slate-400">끝 번호</label>
                <input
                  type="number"
                  value={endNum}
                  onChange={handleEndNumChange}
                  className="w-full rounded-lg border border-slate-200 bg-slate-100 px-3 py-1.5 text-sm text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100"
                  placeholder="자동 계산"
                />
              </div>
            </div>

            <button
              onClick={() => setIsExcludeMode(!isExcludeMode)}
              className={`w-full rounded-xl px-3 py-2 text-sm font-medium transition-colors ${
                isExcludeMode
                  ? "bg-rose-600 text-white shadow-lg shadow-rose-500/30"
                  : "bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40"
              }`}
            >
              제외할 번호 선택 ({excludedNums.size}명)
            </button>
          </div>

          <div className="glass space-y-4 rounded-3xl border border-indigo-100 bg-indigo-50/50 p-5 dark:border-indigo-800 dark:bg-indigo-900/10">
            <div className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-slate-500">배정 가능 좌석</span>
                <span className="font-bold text-indigo-600">{validSeatsCount}석</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">대상 학생</span>
                <span
                  className={`font-bold ${
                    realStudentCount > validSeatsCount ? "text-rose-500" : "text-emerald-600"
                  }`}
                >
                  {realStudentCount}명
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={handleSaveImage}
                disabled={assignments.size === 0 || isAnimating}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-indigo-200 bg-white py-3 font-bold text-indigo-600 shadow-sm transition-all active:scale-95 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Download className="h-5 w-5" />
                저장
              </button>
              <button
                onClick={shuffleSeats}
                disabled={realStudentCount > validSeatsCount || realStudentCount === 0 || isAnimating}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 py-3 font-bold text-white shadow-lg shadow-indigo-500/20 transition-all active:scale-95 hover:bg-indigo-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <RefreshCw className={`h-5 w-5 ${isAnimating ? "animate-spin" : ""}`} />
                {isAnimating ? "..." : "배치"}
              </button>
            </div>
          </div>
        </div>

        <div className="lg:col-span-3">
          {isExcludeMode ? (
            <div className="glass h-full rounded-3xl p-6">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-bold">제외할 번호 선택</h3>
                <button
                  onClick={() => setIsExcludeMode(false)}
                  className="tap-target rounded-full p-1 hover:bg-slate-100 dark:hover:bg-slate-800"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="grid grid-cols-5 gap-2 md:grid-cols-10">
                {potentialStudentList.map((num) => (
                  <button
                    key={num}
                    onClick={() => toggleExcludedNum(num)}
                    className={`aspect-square rounded-xl text-sm font-bold transition-all ${
                      excludedNums.has(num)
                        ? "bg-rose-100 text-rose-600 ring-2 ring-rose-500"
                        : "bg-slate-50 text-slate-600 hover:bg-slate-100"
                    }`}
                  >
                    {num}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div
              ref={gridRef}
              className="flex min-h-[500px] flex-col items-center justify-center gap-8 rounded-3xl bg-white p-8 dark:bg-slate-900"
            >
              <div className="mb-4 flex h-16 w-64 items-center justify-center rounded-lg border-2 border-amber-300 bg-amber-200 shadow-sm dark:border-amber-700/50 dark:bg-amber-900/40">
                <span className="font-bold text-amber-800 dark:text-amber-100">교탁</span>
              </div>

              <div
                className="grid w-full items-center justify-center gap-2 rounded-3xl border border-slate-200 bg-slate-100 p-4 shadow-inner dark:border-slate-700 dark:bg-slate-800/80 md:gap-3 md:p-6"
                style={{ gridTemplateColumns: `auto repeat(${cols}, minmax(0, 1fr))` }}
              >
                <div className="h-6 w-6 md:h-8 md:w-8" />

                {Array.from({ length: cols }).map((_, colIndex) => (
                  <div
                    key={`col-${colIndex}`}
                    className="flex items-center justify-center text-lg font-bold text-slate-400"
                  >
                    {colIndex + 1}
                  </div>
                ))}

                {Array.from({ length: rows }).map((_, rowIndex) => (
                  <div key={`row-group-${rowIndex}`} className="contents">
                    <div className="flex items-center justify-center pr-2 text-lg font-bold text-slate-400">
                      {rowIndex + 1}
                    </div>

                    {Array.from({ length: cols }).map((_, colIndex) => {
                      const key = `${rowIndex}-${colIndex}`;
                      const isVoid = effectiveVoidSeats.has(key);
                      const studentNum = assignments.get(key);
                      const seatLabel = studentNum ? formatSeatLabel(studentNum) : null;

                      return (
                        <button
                          key={key}
                          onClick={() => handleSeatClick(rowIndex, colIndex)}
                          disabled={!isVoidMode && !isVoid}
                          className={`
                            h-10 w-full rounded-lg border bg-white shadow-sm transition-all dark:bg-slate-800 md:h-14
                            ${isVoid ? "border-dashed border-slate-400 bg-transparent opacity-20 shadow-none hover:opacity-100" : "border-slate-200 shadow-md dark:border-slate-700"}
                            ${isVoidMode && !isVoid ? "cursor-pointer hover:ring-2 hover:ring-rose-400" : ""}
                            ${isVoidMode && isVoid ? "cursor-pointer ring-2 ring-rose-400" : ""}
                          `}
                        >
                          {!isVoid && seatLabel ? (
                            <span
                              className={`font-bold text-indigo-600 animate-in zoom-in spin-in-3 duration-300 dark:text-indigo-400 ${
                                seatLabel.length >= 4 ? "text-sm md:text-lg" : "text-base md:text-xl"
                              }`}
                            >
                              {seatLabel}
                            </span>
                          ) : null}
                          {isVoid ? <Ban className="mx-auto h-6 w-6 text-slate-400" /> : null}
                        </button>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
