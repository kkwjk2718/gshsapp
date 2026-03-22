"use client";

import { useActionState, useEffect, useRef } from "react";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { type ActionResult, updateTokenPortalPassword } from "./actions";

const initialState: ActionResult = {};

export function TokenPortalPasswordForm({ hasPassword }: { hasPassword: boolean }) {
  const [state, formAction, isPending] = useActionState(updateTokenPortalPassword, initialState);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
        <div className="flex items-center justify-between gap-3">
          <span className="flex items-center gap-2 font-medium">
            <ShieldCheck className="h-4 w-4" />
            현재 접근 비밀번호
          </span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              hasPassword
                ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                : "bg-amber-100 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300"
            }`}
          >
            {hasPassword ? "설정됨" : "미설정"}
          </span>
        </div>
        <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
          비밀번호를 변경하면 기존 포털 접속 세션은 즉시 만료됩니다.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100">새 비밀번호</label>
          <input
            name="password"
            type="password"
            minLength={6}
            required
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-indigo-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100">새 비밀번호 확인</label>
          <input
            name="confirmPassword"
            type="password"
            minLength={6}
            required
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-indigo-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>

      {state?.error && <p className="text-sm font-medium text-rose-500">{state.error}</p>}
      {state?.success && <p className="text-sm font-medium text-emerald-500">{state.success}</p>}

      <button
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 px-5 py-3 font-bold text-slate-700 transition hover:bg-slate-50 disabled:opacity-50 dark:border-slate-700 dark:text-slate-100 dark:hover:bg-slate-900"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        포털 비밀번호 변경
      </button>
    </form>
  );
}
