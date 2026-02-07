"use client"

import { useState } from "react";
import { Calculator, Trash2, ArrowLeft } from "lucide-react";
import Link from "next/link";

export default function ByteCalculatorPage() {
    const [text, setText] = useState("");

    const calculateBytes = (input: string) => {
        // 1. Remove comments
        // Remove single line comments // ...
        // Remove multi line comments /* ... */
        // Using RegExp constructor to avoid parser issues with literals
        const commentRegex = new RegExp("\\/\\*[\\s\\S]*?\\*\\/|\\/\\/.*", "g");
        const cleanText = input.replace(commentRegex, '');

        let bytes = 0;
        for (let i = 0; i < cleanText.length; i++) {
            const char = cleanText.charAt(i);
            if (encodeURIComponent(char).length > 4) { // Korean & some special chars (usually 3 bytes in NEIS logic often matches UTF-8 3bytes, or specific logic)
                // NEIS specific: Hangul = 3 bytes
                // Common UTF-8: Hangul = 3 bytes.
                // Check if it's Hangul range just to be safe or rely on length?
                // Let's stick to the specific rule: Hangul = 3
                if (/[ㄱ-ㅎ|ㅏ-ㅣ|가-힣]/.test(char)) {
                    bytes += 3;
                } else {
                    // Other multi-byte chars? Assume 1 unless specified?
                    // "그 외 (영어, 숫자, 공백, 특수문자): 1 Byte"
                    // But some special chars might be 3?
                    // Let's follow the manual strict rule: 
                    // If it matches Hangul regex -> 3, else -> 1 (except newline)
                    bytes += 1;
                }
            } else if (char === '\n') {
                bytes += 2;
            } else {
                bytes += 1;
            }
        }
        return bytes;
    };

    const byteCount = calculateBytes(text);

    return (
        <div className="p-4 md:p-8 space-y-6">
            <div className="flex items-center gap-3 mb-6">
                <Link href="/utils" className="p-2 -ml-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full transition-colors mr-2">
                    <ArrowLeft className="w-5 h-5 text-slate-500" />
                </Link>
                <div className="p-3 bg-blue-100 dark:bg-blue-900/30 rounded-full text-blue-600">
                    <Calculator className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold">생기부 바이트 계산기</h1>
                    <p className="text-slate-500">나이스(NEIS) 기준 바이트 수를 계산합니다.</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 glass p-6 rounded-3xl flex flex-col gap-4">
                    <div className="flex justify-between items-center">
                        <label className="font-bold text-slate-700 dark:text-slate-300">내용 입력</label>
                        <button
                            onClick={() => setText("")}
                            className="text-xs flex items-center gap-1 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 px-2 py-1 rounded-lg transition-colors"
                        >
                            <Trash2 className="w-3 h-3" />
                            초기화
                        </button>
                    </div>
                    <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        className="w-full h-64 p-4 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none font-mono text-sm leading-relaxed"
                        placeholder="// 주석은 계산에서 제외됩니다.&#13;&#10;내용을 입력하세요..."
                    />
                    <p className="text-xs text-slate-400">
                        * 한글 3Byte, 줄바꿈 2Byte, 그 외 1Byte (주석 제외)
                    </p>
                </div>

                <div className="glass p-6 rounded-3xl flex flex-col gap-6 h-fit">
                    <div>
                        <h3 className="text-sm font-medium text-slate-500 mb-2">현재 바이트</h3>
                        <div className="text-5xl font-bold text-blue-600 dark:text-blue-400">
                            {byteCount}
                            <span className="text-lg font-medium text-slate-400 ml-2">Bytes</span>
                        </div>
                    </div>

                    <div className="space-y-4 pt-6 border-t border-slate-200 dark:border-slate-800">
                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span>자율활동 (1500B)</span>
                                <span className={byteCount > 1500 ? "text-rose-500" : "text-emerald-500"}>{byteCount} / 1500</span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${byteCount > 1500 ? "bg-rose-500" : "bg-emerald-500"}`}
                                    style={{ width: `${Math.min((byteCount / 1500) * 100, 100)}%` }}
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span>진로활동 (2100B)</span>
                                <span className={byteCount > 2100 ? "text-rose-500" : "text-blue-500"}>{byteCount} / 2100</span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${byteCount > 2100 ? "bg-rose-500" : "bg-blue-500"}`}
                                    style={{ width: `${Math.min((byteCount / 2100) * 100, 100)}%` }}
                                />
                            </div>
                        </div>

                        <div>
                            <div className="flex justify-between text-sm mb-1">
                                <span>세특 (1500B)</span>
                                <span className={byteCount > 1500 ? "text-rose-500" : "text-indigo-500"}>{byteCount} / 1500</span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                <div
                                    className={`h-full rounded-full transition-all duration-500 ${byteCount > 1500 ? "bg-rose-500" : "bg-indigo-500"}`}
                                    style={{ width: `${Math.min((byteCount / 1500) * 100, 100)}%` }}
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}
