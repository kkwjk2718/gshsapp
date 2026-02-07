"use client";

import { ArrowRight, Ticket } from "lucide-react";

export function TokenInput() {
  return (
    <form action="/signup" method="GET" className="space-y-4">
      <div className="text-center p-6 bg-slate-50 dark:bg-slate-800/50 rounded-2xl mb-4">
        <h3 className="font-bold text-slate-700 dark:text-slate-200">초대 토큰이 있으신가요?</h3>
        <p className="text-xs text-slate-500 mt-1 mb-4">
          관리자로부터 받은 초대 토큰을 입력해주세요.
        </p>
        <div className="relative">
            <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
                type="text" 
                name="token"
                placeholder="초대 토큰 입력" 
                required
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:border-indigo-500 focus:ring-indigo-500"
            />
        </div>
      </div>
      <button
        type="submit"
        className="w-full py-3 bg-slate-800 dark:bg-slate-700 text-white font-bold rounded-xl hover:bg-slate-700 dark:hover:bg-slate-600 transition-colors flex items-center justify-center gap-2"
      >
        토큰으로 계속하기 <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}
