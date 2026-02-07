"use client"

import { useState, useTransition, useEffect } from "react";
import { signup } from "./actions";
import { AlertTriangle, CheckCircle, ArrowRight } from "lucide-react";

interface SignupFormProps {
    token: string;
}

export function SignupForm({ token }: SignupFormProps) {
    const [isPending, startTransition] = useTransition();
    const [result, setResult] = useState<{ error?: string } | null>(null);
    const [password, setPassword] = useState("");
    const [confirmPassword, setConfirmPassword] = useState("");
    const passwordsMatch = !password || !confirmPassword || password === confirmPassword;

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (!passwordsMatch) return;

        const formData = new FormData(event.currentTarget);
        setResult(null);

        startTransition(async () => {
            const res = await signup(formData);
            if (res?.error) {
                setResult(res);
            }
        });
    };

    return (
        <form onSubmit={handleSubmit} className="space-y-4">
            <input type="hidden" name="token" value={token} />

            <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">아이디</label>
                <input name="userId" required className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border-transparent focus:border-indigo-500 focus:ring-indigo-500" />
            </div>
            <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">비밀번호</label>
                <input name="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border-transparent focus:border-indigo-500 focus:ring-indigo-500" />
            </div>
            <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">비밀번호 확인</label>
                <input name="confirmPassword" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className={`w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border-2 ${!passwordsMatch ? 'border-rose-500' : 'border-transparent'}`} />
                {!passwordsMatch && <p className="text-xs text-rose-500 mt-1">비밀번호가 일치하지 않습니다.</p>}
            </div>

            <hr className="border-slate-200 dark:border-slate-800" />

            <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">이름</label>
                <input name="name" required className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border-transparent focus:border-indigo-500 focus:ring-indigo-500" />
            </div>
            <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">학번 (예: 42101)</label>
                <input name="studentId" placeholder="선생님은 비워두세요" className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border-transparent focus:border-indigo-500 focus:ring-indigo-500" />
            </div>
            <div>
                <label className="text-xs font-bold text-slate-500 mb-1 block">이메일</label>
                <input name="email" type="email" required className="w-full px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 border-transparent focus:border-indigo-500 focus:ring-indigo-500" />
            </div>

            {result?.error && (
                <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 dark:bg-rose-900/20 p-3 rounded-lg">
                    <AlertTriangle className="w-4 h-4" />
                    {result.error}
                </div>
            )}

            <button
                type="submit"
                disabled={isPending || !passwordsMatch}
                className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
                {isPending ? "가입 중..." : "가입하기"}
                {!isPending && <ArrowRight className="w-4 h-4" />}
            </button>
        </form>
    );
}
