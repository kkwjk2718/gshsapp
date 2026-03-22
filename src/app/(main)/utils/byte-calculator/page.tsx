"use client";

import { useState } from "react";
import { Calculator, Trash2 } from "lucide-react";

import { UtilsBackLink } from "../utils-back-link";

export default function ByteCalculatorPage() {
  const [text, setText] = useState("");

  const calculateBytes = (input: string) => {
    const commentRegex = new RegExp("\\/\\*[\\s\\S]*?\\*\\/|\\/\\/.*", "g");
    const cleanText = input.replace(commentRegex, "");

    let bytes = 0;
    for (let i = 0; i < cleanText.length; i += 1) {
      const char = cleanText.charAt(i);
      if (char === "\n") {
        bytes += 2;
      } else if (/[가-힣]/.test(char)) {
        bytes += 3;
      } else {
        bytes += 1;
      }
    }

    return bytes;
  };

  const byteCount = calculateBytes(text);

  return (
    <div className="mobile-page mobile-safe-bottom space-y-6">
      <div className="mb-6 flex items-center gap-3">
        <UtilsBackLink />
        <div className="rounded-full bg-blue-100 p-3 text-blue-600 dark:bg-blue-900/30">
          <Calculator className="h-6 w-6" />
        </div>
        <div>
          <h1 className="text-2xl font-bold">자기부 바이트 계산기</h1>
          <p className="text-slate-500">
            나이스(NEIS) 기준으로 입력한 내용의 바이트 수를 계산합니다.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="glass flex flex-col gap-4 rounded-3xl p-6 lg:col-span-2">
          <div className="flex items-center justify-between">
            <label className="font-bold text-slate-700 dark:text-slate-300">내용 입력</label>
            <button
              onClick={() => setText("")}
              className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs text-rose-500 transition-colors hover:bg-rose-50 dark:hover:bg-rose-900/20"
            >
              <Trash2 className="h-3 w-3" />
              초기화
            </button>
          </div>

          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            className="h-64 w-full resize-none rounded-xl border border-slate-200 bg-slate-50 p-4 font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900"
            placeholder={"// 주석은 계산에서 제외됩니다.\n내용을 입력해 보세요..."}
          />

          <p className="text-xs text-slate-400">
            * 한글 3Byte, 줄바꿈 2Byte, 그 외 문자는 1Byte로 계산합니다.
          </p>
        </div>

        <div className="glass flex h-fit flex-col gap-6 rounded-3xl p-6">
          <div>
            <h3 className="mb-2 text-sm font-medium text-slate-500">현재 바이트</h3>
            <div className="text-5xl font-bold text-blue-600 dark:text-blue-400">
              {byteCount}
              <span className="ml-2 text-lg font-medium text-slate-400">Bytes</span>
            </div>
          </div>

          <div className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-800">
            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span>자율활동 (1500B)</span>
                <span className={byteCount > 1500 ? "text-rose-500" : "text-emerald-500"}>
                  {byteCount} / 1500
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    byteCount > 1500 ? "bg-rose-500" : "bg-emerald-500"
                  }`}
                  style={{ width: `${Math.min((byteCount / 1500) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span>진로활동 (2100B)</span>
                <span className={byteCount > 2100 ? "text-rose-500" : "text-blue-500"}>
                  {byteCount} / 2100
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    byteCount > 2100 ? "bg-rose-500" : "bg-blue-500"
                  }`}
                  style={{ width: `${Math.min((byteCount / 2100) * 100, 100)}%` }}
                />
              </div>
            </div>

            <div>
              <div className="mb-1 flex justify-between text-sm">
                <span>행특 (1500B)</span>
                <span className={byteCount > 1500 ? "text-rose-500" : "text-indigo-500"}>
                  {byteCount} / 1500
                </span>
              </div>
              <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                <div
                  className={`h-full rounded-full transition-all duration-500 ${
                    byteCount > 1500 ? "bg-rose-500" : "bg-indigo-500"
                  }`}
                  style={{ width: `${Math.min((byteCount / 1500) * 100, 100)}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
