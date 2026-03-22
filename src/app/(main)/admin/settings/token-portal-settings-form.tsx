"use client";

import { useActionState } from "react";
import { Loader2, Mail, Power, Save } from "lucide-react";
import { type ActionResult, updateTokenPortalConfig } from "./actions";

const initialState: ActionResult = {};

type TokenPortalSettingsFormProps = {
  enabled: boolean;
  guidance: string;
  portalUrl: string;
  todaySentCount: number;
  remainingDailyQuota: number;
  isQuotaReached: boolean;
  hasBrevoConfiguration: boolean;
};

export function TokenPortalSettingsForm({
  enabled,
  guidance,
  portalUrl,
  todaySentCount,
  remainingDailyQuota,
  isQuotaReached,
  hasBrevoConfiguration,
}: TokenPortalSettingsFormProps) {
  const [state, formAction, isPending] = useActionState(updateTokenPortalConfig, initialState);

  return (
    <div className="space-y-5">
      <div className="grid gap-3 rounded-2xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">포털 상태</span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              enabled ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300" : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
            }`}
          >
            {enabled ? "활성" : "비활성"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">Brevo 연결</span>
          <span
            className={`rounded-full px-3 py-1 text-xs font-bold ${
              hasBrevoConfiguration
                ? "bg-sky-100 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300"
                : "bg-rose-100 text-rose-700 dark:bg-rose-500/10 dark:text-rose-300"
            }`}
          >
            {hasBrevoConfiguration ? "준비됨" : "미설정"}
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">오늘 발송량</span>
          <span className={`text-sm font-semibold ${isQuotaReached ? "text-rose-500" : ""}`}>
            {todaySentCount} / 300
          </span>
        </div>
        <div className="flex items-center justify-between gap-3">
          <span className="font-medium">남은 발송량</span>
          <span className="text-sm font-semibold">{remainingDailyQuota}건</span>
        </div>
        <div className="rounded-xl border border-dashed border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
          포털 URL: <span className="font-mono">{portalUrl}</span>
        </div>
      </div>

      <form action={formAction} className="space-y-4">
        <label className="flex items-center justify-between gap-4 rounded-2xl border border-slate-200 px-4 py-3 dark:border-slate-700">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
              <Power className="h-4 w-4" />
              학생 토큰 배부 포털 사용
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              활성화하면 공유한 URL에서 비밀번호 입력 후 학생이 직접 토큰 메일을 받을 수 있습니다.
            </p>
          </div>
          <input
            type="checkbox"
            name="enabled"
            defaultChecked={enabled}
            className="h-5 w-5 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
          />
        </label>

        <div className="space-y-2">
          <label className="flex items-center gap-2 text-sm font-bold text-slate-800 dark:text-slate-100">
            <Mail className="h-4 w-4" />
            메일 추가 안내 문구
          </label>
          <textarea
            name="guidance"
            rows={6}
            defaultValue={guidance}
            placeholder="메일 하단에 넣을 추가 안내를 적어주세요."
            className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm outline-none ring-indigo-500 transition focus:ring-2 dark:border-slate-700 dark:bg-slate-950"
          />
          <p className="text-xs text-slate-500 dark:text-slate-400">
            줄바꿈은 메일에서 목록 형태로 정리됩니다.
          </p>
        </div>

        {state?.error && <p className="text-sm font-medium text-rose-500">{state.error}</p>}
        {state?.success && <p className="text-sm font-medium text-emerald-500">{state.success}</p>}

        <button
          disabled={isPending}
          className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-3 font-bold text-white transition hover:bg-indigo-700 disabled:opacity-50"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          포털 설정 저장
        </button>
      </form>
    </div>
  );
}
