"use client";

import { useActionState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { KeyRound, Loader2, LockKeyhole } from "lucide-react";
import { type PortalActionResult, unlockTokenPortal } from "./actions";

const initialState: PortalActionResult = {};

export function PortalAccessForm() {
  const router = useRouter();
  const [state, formAction, isPending] = useActionState(unlockTokenPortal, initialState);

  useEffect(() => {
    if (state?.success) {
      router.refresh();
    }
  }, [router, state?.success]);

  return (
    <form action={formAction} className="space-y-5">
      <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300">
        관리자에게 전달받은 포털 비밀번호를 입력하면 토큰 요청 폼이 열립니다.
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <LockKeyhole className="h-4 w-4" />
          포털 비밀번호
        </label>
        <input
          name="password"
          type="password"
          autoComplete="current-password"
          required
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none ring-indigo-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950"
        />
      </div>

      {state?.error && <p className="text-sm font-medium text-rose-500">{state.error}</p>}

      <button
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <KeyRound className="h-4 w-4" />}
        포털 열기
      </button>
    </form>
  );
}
