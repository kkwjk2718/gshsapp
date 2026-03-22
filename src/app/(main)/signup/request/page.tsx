import type { Metadata } from "next";
import { Mail, Ticket } from "lucide-react";
import { hasValidPortalSession } from "@/lib/token-portal-session";
import { getPublicPortalState } from "@/lib/token-portal";
import { PortalAccessForm } from "./portal-access-form";
import { TokenRequestForm } from "./token-request-form";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "토큰 배부 포털",
  description: "관리자가 안내한 포털 비밀번호를 입력하고 회원가입 초대 토큰을 메일로 받을 수 있습니다.",
  robots: {
    index: false,
    follow: false,
  },
  alternates: {
    canonical: "/signup/request",
  },
};

export default async function SignupRequestPage() {
  const { settings, cooldownSeconds, quota } = await getPublicPortalState();
  const hasSession = await hasValidPortalSession(settings.sessionVersion);

  return (
    <div className="min-h-[100dvh] bg-[var(--background)] px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl dark:border-slate-800 dark:bg-slate-950 sm:p-8">
        <div className="mb-8 space-y-3 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-600/10 text-indigo-600 dark:text-indigo-300">
            <Ticket className="h-7 w-7" />
          </div>
          <div>
            <h1 className="text-3xl font-bold text-slate-900 dark:text-slate-50">GSHS.app 토큰 배부 포털</h1>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
              이름, 학번, 이메일을 입력하면 학생용 회원가입 토큰을 메일로 받아볼 수 있습니다.
            </p>
          </div>
        </div>

        <div className="mb-6 grid gap-3 rounded-3xl border border-slate-200 bg-slate-50 p-5 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300 sm:grid-cols-2">
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">포털 상태</span>
            <span
              className={`rounded-full px-3 py-1 text-xs font-bold ${
                settings.enabled
                  ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300"
                  : "bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
              }`}
            >
              {settings.enabled ? "활성" : "비활성"}
            </span>
          </div>
          <div className="flex items-center justify-between gap-3">
            <span className="font-medium">오늘 발송량</span>
            <span className={`font-semibold ${quota.isLimitReached ? "text-rose-500" : ""}`}>
              {quota.used} / 300
            </span>
          </div>
        </div>

        {!settings.enabled ? (
          <div className="rounded-3xl border border-dashed border-slate-200 px-6 py-8 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400">
            현재 이 포털은 비활성화되어 있습니다. 관리자가 다시 열어줄 때까지 기다려주세요.
          </div>
        ) : !settings.hasPassword ? (
          <div className="rounded-3xl border border-dashed border-amber-200 bg-amber-50 px-6 py-8 text-center text-sm text-amber-700 dark:border-amber-500/20 dark:bg-amber-500/10 dark:text-amber-200">
            관리자 측 설정이 아직 완료되지 않았습니다. 잠시 후 다시 시도해주세요.
          </div>
        ) : hasSession ? (
          <TokenRequestForm cooldownSeconds={cooldownSeconds} />
        ) : (
          <PortalAccessForm />
        )}

        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/50 dark:text-slate-300">
          <div className="flex items-center gap-2 font-semibold text-slate-800 dark:text-slate-100">
            <Mail className="h-4 w-4" />
            안내
          </div>
          <ul className="mt-3 list-disc space-y-2 pl-5">
            <li>이 포털은 학생 계정 초대 토큰 발송 전용입니다.</li>
            <li>메일 수신 후 회원가입 단계는 기존 초대 토큰 가입과 동일하게 진행됩니다.</li>
            <li>문제가 있으면 관리자에게 문의해주세요: admin@gshs.app</li>
          </ul>
        </div>
      </div>
    </div>
  );
}
