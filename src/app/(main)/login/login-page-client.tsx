"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, Loader2, Lock, User } from "lucide-react";
import { authenticate } from "@/lib/actions";

export default function LoginPage() {
  const [errorMessage, dispatch, isPending] = useActionState(authenticate, undefined);

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden bg-slate-50 p-4 transition-colors dark:bg-slate-950">
      <div className="pointer-events-none absolute left-[-10%] top-[-10%] h-[40vw] max-h-[500px] w-[40vw] max-w-[500px] rounded-full bg-indigo-500/20 opacity-60 blur-[80px] dark:bg-indigo-600/20 dark:opacity-50" />
      <div className="pointer-events-none absolute bottom-[-10%] right-[-10%] h-[40vw] max-h-[500px] w-[40vw] max-w-[500px] rounded-full bg-sky-500/20 opacity-60 blur-[80px] dark:bg-sky-600/20 dark:opacity-50" />

      <div className="relative z-10 w-full max-w-md rounded-[2rem] border border-slate-200 bg-white/90 p-6 shadow-xl ring-1 ring-slate-200/60 backdrop-blur-2xl dark:border-slate-800/50 dark:bg-slate-900/70 dark:shadow-2xl dark:ring-white/10 sm:p-8">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">GSHS.app</h1>
          <p className="mt-2 text-slate-600 dark:text-slate-400">학생 통합 플랫폼 로그인</p>
        </div>

        <form action={dispatch} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="userId">
              아이디
            </label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                id="userId"
                name="userId"
                type="text"
                placeholder="아이디를 입력하세요"
                required
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="password">
              비밀번호
            </label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-slate-400" />
              <input
                id="password"
                name="password"
                type="password"
                placeholder="비밀번호를 입력하세요"
                required
                minLength={4}
                className="w-full rounded-xl border border-slate-200 bg-slate-50 py-3 pl-10 pr-4 focus:outline-none focus:ring-2 focus:ring-indigo-500 dark:border-slate-700 dark:bg-slate-800"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 px-1">
            <input
              type="checkbox"
              id="keepLoggedIn"
              defaultChecked
              className="h-4 w-4 rounded border-slate-300 text-indigo-600 accent-indigo-600 focus:ring-indigo-500"
            />
            <label
              htmlFor="keepLoggedIn"
              className="cursor-pointer select-none text-sm text-slate-600 dark:text-slate-400"
            >
              로그인 상태 유지
            </label>
          </div>

          <div className="flex h-8 items-end space-x-1" aria-live="polite" aria-atomic="true">
            {errorMessage ? <p className="text-sm text-red-500">{errorMessage}</p> : null}
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="btn-primary min-h-13 w-full text-base shadow-[0_20px_45px_rgba(13,59,102,0.22)]"
          >
            {isPending ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                <span>로그인 중...</span>
              </>
            ) : (
              <>
                <span>로그인</span>
                <ArrowRight className="h-5 w-5" />
              </>
            )}
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          계정이 없으신가요?
          <Link href="/signup" className="ml-1 font-semibold text-indigo-600 hover:underline dark:text-indigo-400">
            회원가입하기
          </Link>
        </div>
      </div>
    </div>
  );
}
