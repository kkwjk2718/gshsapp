"use client";

import { useActionState, useEffect, useRef } from "react";
import { Loader2, Mail, Send, Ticket } from "lucide-react";
import { type PortalActionResult, requestSignupToken } from "./actions";

const initialState: PortalActionResult = {};

export function TokenRequestForm({ cooldownSeconds }: { cooldownSeconds: number }) {
  const formRef = useRef<HTMLFormElement>(null);
  const [state, formAction, isPending] = useActionState(requestSignupToken, initialState);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
    }
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100">이름</label>
          <input
            name="name"
            required
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none ring-indigo-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100">학번</label>
          <input
            name="studentId"
            inputMode="numeric"
            maxLength={4}
            required
            placeholder="예: 1304"
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none ring-indigo-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950"
          />
        </div>
      </div>

      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <Mail className="h-4 w-4" />
          이메일 주소
        </label>
        <input
          name="email"
          type="email"
          required
          placeholder="example@gshs.hs.kr"
          className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 outline-none ring-indigo-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950"
        />
      </div>

      <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-sm text-sky-700 dark:border-sky-500/30 dark:bg-sky-500/10 dark:text-sky-200">
        입력한 이메일로 초대 토큰과 회원가입 링크가 바로 발송됩니다. 이후 회원가입 단계는 기존 초대 토큰 가입과 동일하게 진행됩니다.
        {cooldownSeconds > 0 && (
          <div className="mt-2 font-semibold">현재 브라우저에서 {cooldownSeconds}초 후 다시 요청할 수 있습니다.</div>
        )}
      </div>

      {state?.error && <p className="text-sm font-medium text-rose-500">{state.error}</p>}
      {state?.success && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-medium text-emerald-700 dark:border-emerald-500/30 dark:bg-emerald-500/10 dark:text-emerald-200">
          {state.success}
        </div>
      )}

      <button
        disabled={isPending}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-indigo-600 px-4 py-3 font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        토큰 메일 받기
      </button>
    </form>
  );
}
