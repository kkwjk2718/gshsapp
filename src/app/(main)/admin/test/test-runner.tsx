"use client"

import { useState } from "react";
import { runSystemTests, TestResult } from "./actions";
import { Play, CheckCircle, XCircle, Loader2, AlertTriangle } from "lucide-react";

export function TestRunner() {
  const [results, setResults] = useState<TestResult[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null);

  const handleRunTest = async () => {
    setLoading(true);
    setResults(null);
    setError(null);
    setExpandedIndex(null); // Reset expansion
    try {
      const data = await runSystemTests();
      setResults(data);
    } catch (e: any) {
      setError(e.message || "An error occurred during the test.");
    } finally {
      setLoading(false);
    }
  };

  const toggleExpand = (idx: number) => {
    setExpandedIndex(expandedIndex === idx ? null : idx);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-center">
        <button
          onClick={handleRunTest}
          disabled={loading}
          className="group relative inline-flex h-14 items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-8 font-bold text-white transition-all duration-300 hover:scale-105 hover:shadow-lg hover:shadow-indigo-500/30 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:ring-offset-2 disabled:opacity-70 disabled:scale-100"
        >
          {loading ? (
            <Loader2 className="mr-2 h-5 w-5 animate-spin" />
          ) : (
            <Play className="mr-2 h-5 w-5 fill-current" />
          )}
          <span>{loading ? "시스템 진단 중..." : "전체 시스템 기능 진단 시작"}</span>
        </button>
      </div>

      {error && (
        <div className="rounded-xl bg-rose-900/20 p-4 text-rose-400 flex items-center gap-3 border border-rose-800">
          <AlertTriangle className="h-5 w-5" />
          {error}
        </div>
      )}

      {results && (
        <div className="grid gap-4">
          {results.map((res, idx) => (
            <div key={idx} className="group overflow-hidden bg-slate-900 rounded-2xl border border-slate-800 shadow-sm transition-all duration-500 animate-in fade-in slide-in-from-bottom-2" style={{ animationDelay: `${idx * 100}ms` }}>
              <div
                className="flex items-center justify-between p-5 cursor-pointer hover:bg-slate-800/50 transition-colors"
                onClick={() => toggleExpand(idx)}
              >
                <div className="flex items-center gap-4">
                  {res.status === 'PASS' ? (
                    <div className="p-2 bg-emerald-900/30 text-emerald-600 rounded-full">
                      <CheckCircle className="h-6 w-6" />
                    </div>
                  ) : (
                    <div className="p-2 bg-rose-900/30 text-rose-600 rounded-full">
                      <XCircle className="h-6 w-6" />
                    </div>
                  )}
                  <div>
                    <div className="font-bold text-slate-200 text-lg flex items-center gap-2">
                      {res.name}
                      <span className="text-xs font-normal px-2 py-0.5 rounded bg-slate-800 text-slate-400 group-hover:bg-slate-700 transition-colors">
                        {expandedIndex === idx ? "접기" : "상세보기"}
                      </span>
                    </div>
                    {res.message && <div className="text-sm text-rose-500 mt-1 font-medium">{res.message}</div>}
                  </div>
                </div>
                <div className="text-right">
                  <div className={`text-base font-bold ${res.status === 'PASS' ? 'text-emerald-600' : 'text-rose-600'}`}>{res.status}</div>
                  {res.latency !== undefined && <div className="text-xs text-slate-400 font-mono mt-1">{res.latency}ms</div>}
                </div>
              </div>

              {/* Detail Logs */}
              {expandedIndex === idx && res.details && (
                <div className="px-5 pb-5 animate-in slide-in-from-top-2 duration-200">
                  <div className="p-4 bg-black/50 rounded-xl font-mono text-xs md:text-sm text-emerald-400/90 border border-slate-800 max-h-60 overflow-y-auto">
                    {res.details.map((log, i) => (
                      <div key={i} className="mb-1 last:mb-0 break-all">
                        <span className="text-slate-600 mr-2">$</span>
                        {log}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
