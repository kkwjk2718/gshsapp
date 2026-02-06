"use client"

import { useState, useTransition } from "react";
import { changePassword } from "./actions";
import { KeyRound, CheckCircle, AlertTriangle } from "lucide-react";

export function PasswordChangeForm() {
    const [isPending, startTransition] = useTransition();
    const [result, setResult] = useState<{ success?: string; error?: string } | null>(null);

    const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        const formData = new FormData(event.currentTarget);
        
        setResult(null);
        startTransition(async () => {
            const res = await changePassword(formData);
            setResult(res);

            if (res.success) {
                (event.target as HTMLFormElement).reset();
            }
        });
    };
    
    return (
        <div className="glass p-6 rounded-3xl">
            <h2 className="text-lg font-bold flex items-center gap-2 mb-4">
                <KeyRound className="w-5 h-5 text-indigo-500" />
                비밀번호 변경
            </h2>

            <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">현재 비밀번호</label>
                    <input name="currentPassword" type="password" required className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">새 비밀번호</label>
                    <input name="newPassword" type="password" required className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">새 비밀번호 확인</label>
                    <input name="confirmPassword" type="password" required className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                </div>

                {result?.success && (
                    <div className="flex items-center gap-2 text-sm text-emerald-600 bg-emerald-50 p-3 rounded-lg">
                        <CheckCircle className="w-4 h-4" />
                        {result.success}
                    </div>
                )}
                {result?.error && (
                    <div className="flex items-center gap-2 text-sm text-rose-600 bg-rose-50 p-3 rounded-lg">
                        <AlertTriangle className="w-4 h-4" />
                        {result.error}
                    </div>
                )}

                <button 
                    disabled={isPending}
                    className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                    {isPending ? "변경 중..." : "비밀번호 변경"}
                </button>
            </form>
        </div>
    );
}
