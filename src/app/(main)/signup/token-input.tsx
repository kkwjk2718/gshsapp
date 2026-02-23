"use client";

import { ArrowRight, Ticket } from "lucide-react";

export function TokenInput() {
  return (
    <form action="/signup" method="GET" className="space-y-4">
      <div className="text-center p-6 rounded-2xl mb-4" style={{ backgroundColor: "var(--surface-2)" }}>
        <h3 className="font-bold" style={{ color: "var(--foreground)" }}>초대 토큰이 있으신가요?</h3>
        <p className="text-xs mt-1 mb-4" style={{ color: "var(--muted)" }}>
          관리자로부터 받은 초대 토큰을 입력해주세요.
        </p>
        <div className="relative">
            <Ticket className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: "var(--muted)" }} />
            <input 
                type="text" 
                name="token"
                placeholder="초대 토큰 입력" 
                required
                className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border"
                style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }}
            />
        </div>
      </div>
      <button
        type="submit"
        className="w-full py-3 font-bold rounded-xl transition-colors flex items-center justify-center gap-2"
        style={{ backgroundColor: "var(--accent)", color: "var(--brand-sub)" }}
      >
        토큰으로 계속하기 <ArrowRight className="w-4 h-4" />
      </button>
    </form>
  );
}
