import { SignupForm } from "./signup-form";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { TokenInput } from "./token-input";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token: searchToken } = await searchParams;
  const token = searchToken || "";

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-slate-50 dark:bg-slate-950 p-4">
      <div className="w-full max-w-sm bg-white dark:bg-slate-900 p-6 sm:p-8 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-800">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-indigo-600 dark:text-indigo-400">GSHS.app</h1>
          <p className="text-slate-500 dark:text-slate-400 mt-2">회원가입</p>
        </div>

        {token ? (
          <>
            <div className="flex items-center gap-2 p-3 mb-4 bg-indigo-50 dark:bg-indigo-900/20 rounded-xl text-indigo-600">
              <Ticket className="w-5 h-5" />
              <span className="font-mono text-sm font-bold">{token}</span>
            </div>
            <SignupForm token={token} />
          </>
        ) : (
          <TokenInput />
        )}

        <div className="mt-6 text-center text-sm text-slate-400">
          이미 계정이 있으신가요? <Link href="/login" className="text-indigo-500 hover:underline">로그인</Link>
        </div>
      </div>
    </div>
  );
}