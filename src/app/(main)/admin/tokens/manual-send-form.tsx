"use client";

import { useActionState, useEffect, useRef, useState } from "react";
import { Loader2, MailPlus, Send } from "lucide-react";
import { type TokenMailActionResult, sendTokenByEmail } from "./actions";

const initialState: TokenMailActionResult = {};

export function ManualSendForm() {
  const formRef = useRef<HTMLFormElement>(null);
  const [targetRole, setTargetRole] = useState("STUDENT");
  const [state, formAction, isPending] = useActionState(sendTokenByEmail, initialState);

  useEffect(() => {
    if (state?.success) {
      formRef.current?.reset();
      setTargetRole("STUDENT");
    }
  }, [state?.success]);

  return (
    <form ref={formRef} action={formAction} className="space-y-4">
      <div className="space-y-2">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
          <MailPlus className="h-4 w-4" />
          수신 이메일
        </label>
        <input
          name="email"
          type="email"
          required
          placeholder="example@gshs.hs.kr"
          className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
        />
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100">권한</label>
          <select
            name="targetRole"
            value={targetRole}
            onChange={(event) => setTargetRole(event.target.value)}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-700 dark:bg-slate-900"
          >
            <option value="STUDENT">학생</option>
            <option value="TEACHER">교사</option>
            <option value="ADMIN">관리자</option>
          </select>
        </div>

        <div className="space-y-2">
          <label className="text-sm font-bold text-slate-800 dark:text-slate-100">기수</label>
          <input
            name="targetGisu"
            type="number"
            min={1}
            disabled={targetRole !== "STUDENT"}
            placeholder={targetRole === "STUDENT" ? "예: 42" : "학생 전용"}
            className="w-full rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 disabled:cursor-not-allowed disabled:opacity-60 dark:border-slate-700 dark:bg-slate-900"
          />
        </div>
      </div>

      {state?.error && <p className="text-sm font-medium text-rose-500">{state.error}</p>}
      {state?.success && <p className="text-sm font-medium text-emerald-500">{state.success}</p>}

      <button
        disabled={isPending}
        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
      >
        {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        초대 메일 발송
      </button>
    </form>
  );
}
