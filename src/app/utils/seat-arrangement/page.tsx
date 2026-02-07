"use client"

import React, { useState, useEffect, useRef } from "react";
import { ArrowLeft, User, Shuffle, RefreshCw, Armchair, Settings, X, Ban, Download } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";
import { toPng } from 'html-to-image';

export default function SeatArrangementPage() {
    // Seat Settings
    const [rows, setRows] = useState<number>(5);
    const [cols, setCols] = useState<number>(6);
    const [voidSeats, setVoidSeats] = useState<Set<string>>(new Set()); // "row-col" format
    const [isVoidMode, setIsVoidMode] = useState<boolean>(false);

    // Student Settings
    const [startNum, setStartNum] = useState<string>("1"); // Start number
    const [excludedNums, setExcludedNums] = useState<Set<number>>(new Set());
    const [isExcludeMode, setIsExcludeMode] = useState<boolean>(false);

    // Results
    const [assignments, setAssignments] = useState<Map<string, number>>(new Map());
    const [isAnimating, setIsAnimating] = useState<boolean>(false);

    // Clear assignments when grid changes
    useEffect(() => {
        setAssignments(new Map());
    }, [rows, cols, voidSeats, startNum, excludedNums]);

    // Derived Values
    const totalSeats = rows * cols;
    const validSeatsCount = totalSeats - voidSeats.size;

    const [endNum, setEndNum] = useState<string>("");
    const [isEndNumManual, setIsEndNumManual] = useState<boolean>(false);

    // Smart default for endNum: Sync with validSeatsCount until manually edited
    useEffect(() => {
        if (!isEndNumManual) {
            const start = parseInt(startNum) || 1;
            setEndNum(String(start + validSeatsCount - 1));
        }
    }, [validSeatsCount, startNum, isEndNumManual]);

    const handleEndNumChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        setEndNum(e.target.value);
        setIsEndNumManual(true);
    };

    // Initialize endNum based on logic if empty?
    // Let's just calculate "Expected End Number" for display.

    const handleSeatClick = (r: number, c: number) => {
        const key = `${r}-${c}`;
        if (isVoidMode) {
            const newVoidSeats = new Set(voidSeats);
            if (newVoidSeats.has(key)) {
                newVoidSeats.delete(key);
            } else {
                newVoidSeats.add(key);
            }
            setVoidSeats(newVoidSeats);
        }
    };

    const toggleExcludedNum = (num: number) => {
        const newExcluded = new Set(excludedNums);
        if (newExcluded.has(num)) {
            newExcluded.delete(num);
        } else {
            newExcluded.add(num);
        }
        setExcludedNums(newExcluded);
    }

    const shuffleSeats = () => {
        const start = parseInt(startNum);
        const end = parseInt(endNum);

        if (isNaN(start) || isNaN(end)) {
            toast.error("학번 범위를 올바르게 입력해주세요.");
            return;
        }

        // Generate Student List
        const students: number[] = [];
        for (let i = start; i <= end; i++) {
            if (!excludedNums.has(i)) {
                students.push(i);
            }
        }

        const studentCount = students.length;

        if (studentCount > validSeatsCount) {
            toast.error(`학생 수(${studentCount}명)가 배정 가능한 좌석 수(${validSeatsCount}석)보다 많습니다.`);
            return;
        }

        // Warn if significantly fewer students
        if (validSeatsCount - studentCount > 5) {
            toast("좌석이 학생 수보다 많이 남습니다.", { description: "빈 자리가 많이 생깁니다." });
        }

        setIsAnimating(true);
        setAssignments(new Map());

        // Animation Logic
        let currentInterval = 5; // Start very fast
        let elapsed = 0;
        const totalDuration = 2500 + Math.random() * 1000; // 2.5~3.5 seconds

        const availableSeatKeys: string[] = [];
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (!voidSeats.has(`${r}-${c}`)) {
                    availableSeatKeys.push(`${r}-${c}`);
                }
            }
        }

        const animate = () => {
            // Random scramble effect
            const tempMap = new Map<string, number>();
            const shuffledKeys = [...availableSeatKeys].sort(() => Math.random() - 0.5);

            // Show random numbers in random seats
            students.forEach((s, idx) => {
                if (idx < shuffledKeys.length) tempMap.set(shuffledKeys[idx], s);
            });

            setAssignments(tempMap);

            elapsed += currentInterval;
            currentInterval *= 1.1; // Slow down by 10% each step

            if (elapsed < totalDuration) {
                setTimeout(animate, currentInterval);
            } else {
                // Final Shuffle & Set
                const finalMap = new Map<string, number>();
                const finalKeys = [...availableSeatKeys].sort(() => Math.random() - 0.5);

                const shuffledStudents = [...students].sort(() => Math.random() - 0.5);

                shuffledStudents.forEach((student, idx) => {
                    finalMap.set(finalKeys[idx], student);
                });

                setAssignments(finalMap);
                setIsAnimating(false);
                toast.success("자리 배치가 완료되었습니다!");
            }
        };

        animate();
    };

    const gridRef = useRef<HTMLDivElement>(null);

    // Calculate expected student count
    const currentStart = parseInt(startNum) || 1;
    const currentEnd = parseInt(endNum) || 0;

    const potentialStudentList = [];
    if (currentEnd >= currentStart) {
        for (let i = currentStart; i <= currentEnd; i++) potentialStudentList.push(i);
    }
    const realStudentCount = potentialStudentList.filter(n => !excludedNums.has(n)).length;

    const handleSaveImage = async () => {
        if (!gridRef.current) return;

        try {
            // Force Dark Mode for capture
            gridRef.current.classList.add('dark');

            const dataUrl = await toPng(gridRef.current, {
                cacheBust: true,
                backgroundColor: '#0f172a', // Force slate-900 background
            });

            // Remove Dark Mode class
            gridRef.current.classList.remove('dark');

            const link = document.createElement('a');
            link.download = `자리배치표_${new Date().toISOString().slice(0, 10)}.png`;
            link.href = dataUrl;
            link.click();
            toast.success("이미지로 저장되었습니다.");
        } catch (error) {
            console.error("Image save failed:", error);
            toast.error("이미지 저장에 실패했습니다.");
            // Ensure class is removed in case of error
            if (gridRef.current) gridRef.current.classList.remove('dark');
        }
    };

    return (
        <div className="p-4 md:p-8 max-w-6xl mx-auto space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <Link href="/utils" className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors mr-2">
                    <ArrowLeft className="w-5 h-5 text-slate-500" />
                </Link>
                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-full text-indigo-600">
                    <Armchair className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">자리 배치</h1>
                    <p className="text-slate-500">교실 좌석을 랜덤으로 배치합니다.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
                {/* Settings Panel */}
                <div className="lg:col-span-1 space-y-6">
                    {/* 1. Grid Settings */}
                    <div className="glass p-5 rounded-3xl space-y-4">
                        <h2 className="font-bold flex items-center gap-2 text-slate-700 dark:text-slate-200">
                            <Settings className="w-4 h-4" /> 좌석 설정
                        </h2>
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span>가로 (열)</span>
                                <span className="font-mono">{cols}</span>
                            </div>
                            <input
                                type="range" min="1" max="10" value={cols}
                                onChange={(e) => setCols(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                        </div>
                        <div className="space-y-1">
                            <div className="flex justify-between text-sm">
                                <span>세로 (행)</span>
                                <span className="font-mono">{rows}</span>
                            </div>
                            <input
                                type="range" min="1" max="10" value={rows}
                                onChange={(e) => setRows(parseInt(e.target.value))}
                                className="w-full h-2 bg-slate-200 rounded-lg appearance-none cursor-pointer accent-indigo-600"
                            />
                        </div>

                        <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                            <button
                                onClick={() => setIsVoidMode(!isVoidMode)}
                                className={`w-full py-2 px-3 rounded-xl text-sm font-medium transition-all flex items-center justify-center gap-2 ${isVoidMode ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/30 ring-2 ring-rose-500 ring-offset-1' : 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40'}`}
                            >
                                <Ban className="w-4 h-4" />
                                {isVoidMode ? "선택 종료" : "없는 자리 지정하기"}
                            </button>
                            <p className="text-xs text-slate-400 mt-2 text-center">
                                {isVoidMode ? "좌석을 클릭하여 사용 안 함 처리하세요" : "버튼을 누르고 빈 공간으로 둘 자리를 클릭하세요"}
                            </p>
                        </div>
                    </div>

                    {/* 2. Student Settings */}
                    <div className="glass p-5 rounded-3xl space-y-4">
                        <h2 className="font-bold flex items-center gap-2 text-slate-700 dark:text-slate-200">
                            <User className="w-4 h-4" /> 학생 설정
                        </h2>
                        <div className="grid grid-cols-2 gap-3">
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 dark:text-slate-400">시작 번호</label>
                                <input
                                    type="number" value={startNum}
                                    onChange={(e) => setStartNum(e.target.value)}
                                    className="w-full px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                />
                            </div>
                            <div className="space-y-1">
                                <label className="text-xs text-slate-500 dark:text-slate-400">끝 번호</label>
                                <input
                                    type="number" value={endNum}
                                    onChange={handleEndNumChange}
                                    className="w-full px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                    placeholder="자동 계산됨"
                                />
                            </div>
                        </div>

                        <button
                            onClick={() => setIsExcludeMode(!isExcludeMode)}
                            className={`w-full py-2 px-3 rounded-xl text-sm font-medium transition-colors ${isExcludeMode ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/30' : 'bg-rose-50 text-rose-600 hover:bg-rose-100 dark:bg-rose-900/20 dark:text-rose-400 dark:hover:bg-rose-900/40'}`}
                        >
                            제외할 번호 선택 ({excludedNums.size}명)
                        </button>
                    </div>

                    {/* 3. Status & Action */}
                    <div className="glass p-5 rounded-3xl space-y-4 bg-indigo-50/50 dark:bg-indigo-900/10 border-indigo-100 dark:border-indigo-800">
                        <div className="space-y-2 text-sm">
                            <div className="flex justify-between">
                                <span className="text-slate-500">배정 가능 좌석</span>
                                <span className="font-bold text-indigo-600">{validSeatsCount}석</span>
                            </div>
                            <div className="flex justify-between">
                                <span className="text-slate-500">대상 학생</span>
                                <span className={`font-bold ${realStudentCount > validSeatsCount ? 'text-rose-500' : 'text-emerald-600'}`}>
                                    {realStudentCount}명
                                </span>
                            </div>
                        </div>

                        <div className="grid grid-cols-2 gap-2">
                            <button
                                onClick={handleSaveImage}
                                disabled={assignments.size === 0 || isAnimating}
                                className="w-full py-3 bg-white text-indigo-600 border border-indigo-200 hover:bg-slate-50 rounded-xl font-bold shadow-sm active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <Download className="w-5 h-5" />
                                저장
                            </button>
                            <button
                                onClick={shuffleSeats}
                                disabled={realStudentCount > validSeatsCount || realStudentCount === 0 || isAnimating}
                                className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 active:scale-95 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                            >
                                <RefreshCw className={`w-5 h-5 ${isAnimating ? "animate-spin" : ""}`} />
                                {isAnimating ? "..." : "배치"}
                            </button>
                        </div>
                    </div>
                </div>

                {/* Main Grid Display */}
                <div className="lg:col-span-3">
                    {isExcludeMode ? (
                        <div className="glass p-6 rounded-3xl h-full">
                            <div className="flex justify-between items-center mb-4">
                                <h3 className="font-bold text-lg">제외할 번호 선택</h3>
                                <button
                                    onClick={() => setIsExcludeMode(false)}
                                    className="p-1 hover:bg-slate-100 rounded-full"
                                >
                                    <X className="w-5 h-5" />
                                </button>
                            </div>
                            <div className="grid grid-cols-5 md:grid-cols-10 gap-2">
                                {potentialStudentList.map(num => (
                                    <button
                                        key={num}
                                        onClick={() => toggleExcludedNum(num)}
                                        className={`aspect-square rounded-xl flex items-center justify-center font-bold text-sm transition-all ${excludedNums.has(num) ? 'bg-rose-100 text-rose-600 ring-2 ring-rose-500' : 'bg-slate-50 text-slate-600 hover:bg-slate-100'}`}
                                    >
                                        {num}
                                    </button>
                                ))}
                            </div>
                        </div>
                    ) : (
                        <div
                            ref={gridRef}
                            className="flex flex-col items-center gap-8 min-h-[500px] justify-center p-8 bg-white dark:bg-slate-900 rounded-3xl"
                        >
                            {/* Teacher Desk */}
                            <div className="w-64 h-16 bg-amber-200 dark:bg-amber-900/40 border-2 border-amber-300 dark:border-amber-700/50 rounded-lg flex items-center justify-center shadow-sm mb-4">
                                <span className="font-bold text-amber-800 dark:text-amber-100">교탁</span>
                            </div>

                            {/* Seating Grid */}
                            {/* Seating Grid with Coordinates */}
                            <div
                                className="grid gap-3 md:gap-4 p-6 rounded-3xl bg-slate-100 dark:bg-slate-800/80 border border-slate-200 dark:border-slate-700 shadow-inner items-center justify-center"
                                style={{
                                    gridTemplateColumns: `auto repeat(${cols}, minmax(0, 1fr))`
                                }}
                            >
                                {/* Top-Left Corner (Empty) */}
                                <div className="w-6 h-6 md:w-8 md:h-8" />

                                {/* Column Headers */}
                                {Array.from({ length: cols }).map((_, c) => (
                                    <div key={`col-${c}`} className="flex items-center justify-center font-bold text-slate-400 text-lg">
                                        {c + 1}
                                    </div>
                                ))}

                                {/* Rows */}
                                {Array.from({ length: rows }).map((_, r) => (
                                    /* Use fragment with key to satisfy unique key prop warning */
                                    <div key={`row-group-${r}`} className="contents">
                                        {/* Row Header */}
                                        <div className="flex items-center justify-center font-bold text-slate-400 text-lg pr-2">
                                            {r + 1}
                                        </div>

                                        {/* Seats */}
                                        {Array.from({ length: cols }).map((_, c) => {
                                            const key = `${r}-${c}`;
                                            const isVoid = voidSeats.has(key);
                                            const studentNum = assignments.get(key);

                                            return (
                                                <button
                                                    key={key}
                                                    onClick={() => handleSeatClick(r, c)}
                                                    disabled={!isVoidMode && !isVoid}
                                                    className={`
                                            w-16 h-12 md:w-24 md:h-16 rounded-lg flex items-center justify-center transition-all bg-white dark:bg-slate-800 shadow-sm border
                                            ${isVoid ? 'opacity-20 hover:opacity-100 border-dashed border-slate-400 bg-transparent shadow-none' : 'border-slate-200 dark:border-slate-700 shadow-md'}
                                            ${isVoidMode && !isVoid ? 'hover:ring-2 hover:ring-rose-400 cursor-pointer' : ''}
                                            ${isVoidMode && isVoid ? 'ring-2 ring-rose-400 cursor-pointer' : ''}
                                        `}
                                                >
                                                    {!isVoid && (
                                                        studentNum && (
                                                            <span className="text-2xl font-bold text-indigo-600 dark:text-indigo-400 animate-in zoom-in spin-in-3 duration-300">
                                                                {studentNum}
                                                            </span>
                                                        )
                                                    )}
                                                    {isVoid && <Ban className="w-6 h-6 text-slate-400" />}
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
