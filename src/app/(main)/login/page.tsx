"use client"

import { useActionState } from 'react';
import { authenticate } from '@/lib/actions';
import { User, Lock, ArrowRight } from 'lucide-react';
import Link from "next/link";

export default function LoginPage() {
  const [errorMessage, dispatch, isPending] = useActionState(
    authenticate,
    undefined,
  );

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4 relative overflow-hidden transition-colors">
      {/* Background Glow Effects */}
      <div className="absolute top-[-10%] left-[-10%] w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] bg-indigo-500/20 dark:bg-indigo-600/20 rounded-full blur-[80px] opacity-60 dark:opacity-50 pointer-events-none" />
      <div className="absolute bottom-[-10%] right-[-10%] w-[40vw] h-[40vw] max-w-[500px] max-h-[500px] bg-purple-500/20 dark:bg-purple-600/20 rounded-full blur-[80px] opacity-60 dark:opacity-50 pointer-events-none" />

      <div className="w-full max-w-md bg-white/85 dark:bg-slate-900/60 backdrop-blur-2xl p-6 sm:p-8 rounded-3xl shadow-xl dark:shadow-2xl border border-slate-200 dark:border-slate-800/50 relative z-10 ring-1 ring-slate-200/60 dark:ring-white/10">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">GSHS.app</h1>
          <p className="text-slate-600 dark:text-slate-400 mt-2">학생 통합 플랫폼 로그인</p>
        </div>

        <form action={dispatch} className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="userId">아이디</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="userId"
                name="userId"
                type="text"
                placeholder="아이디를 입력하세요"
                required
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium text-slate-700 dark:text-slate-300" htmlFor="password">비밀번호</label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                id="password"
                name="password"
                type="password"
                placeholder="비밀번호를 입력하세요"
                required
                minLength={4}
                className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 px-1">
            <input
              type="checkbox"
              id="keepLoggedIn"
              defaultChecked
              className="w-4 h-4 rounded border-slate-300 text-indigo-600 focus:ring-indigo-500 accent-indigo-600"
            />
            <label htmlFor="keepLoggedIn" className="text-sm text-slate-600 dark:text-slate-400 select-none cursor-pointer">
              로그인 상태 유지
            </label>
          </div>


          <div
            className="flex h-8 items-end space-x-1"
            aria-live="polite"
            aria-atomic="true"
          >
            {errorMessage && (
              <>
                <p className="text-sm text-red-500">{errorMessage}</p>
              </>
            )}
          </div>

          <button
            type="submit"
            disabled={isPending}
            className="w-full flex items-center justify-center gap-2 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold transition-colors disabled:opacity-50"
          >
            <span>로그인</span>
            <ArrowRight className="w-5 h-5" />
          </button>
        </form>

        <div className="mt-6 text-center text-sm text-slate-600 dark:text-slate-400">
          계정이 없으신가요? <Link href="/signup" className="text-indigo-600 dark:text-indigo-400 hover:underline font-semibold ml-1">회원가입하기</Link>
        </div>
        <div className="mt-2 text-center text-xs text-slate-500 dark:text-slate-600">
          Test ID: student / PW: password
        </div>
      </div>
    </div>
  );
}