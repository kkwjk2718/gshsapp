"use client"

import { useState, useTransition } from "react";
import { signup } from "./actions";
import { AlertTriangle, ArrowRight } from "lucide-react";

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
                <label className="text-xs font-bold mb-1 block" style={{ color: "var(--muted)" }}>아이디</label>
                <input name="userId" required className="w-full px-3 py-2 rounded-xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} />
            </div>
            <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: "var(--muted)" }}>비밀번호</label>
                <input name="password" type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="w-full px-3 py-2 rounded-xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} />
            </div>
            <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: "var(--muted)" }}>비밀번호 확인</label>
                <input name="confirmPassword" type="password" required value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} className="w-full px-3 py-2 rounded-xl border-2" style={{ backgroundColor: "var(--surface)", borderColor: !passwordsMatch ? '#ef4444' : 'var(--border)', color: "var(--foreground)" }} />
                {!passwordsMatch && <p className="text-xs mt-1" style={{ color: "#ef4444" }}>비밀번호가 일치하지 않습니다.</p>}
            </div>

            <hr style={{ borderColor: "var(--border)" }} />

            <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: "var(--muted)" }}>이름</label>
                <input name="name" required className="w-full px-3 py-2 rounded-xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} />
            </div>
            <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: "var(--muted)" }}>학번 (4자리, 예: 1304)</label>
                <input
                    name="studentId"
                    inputMode="numeric"
                    maxLength={4}
                    placeholder="예: 1304 (선생님은 비워두세요)"
                    className="w-full px-3 py-2 rounded-xl border"
                    style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }}
                />
            </div>
            <div>
                <label className="text-xs font-bold mb-1 block" style={{ color: "var(--muted)" }}>이메일</label>
                <input name="email" type="email" required className="w-full px-3 py-2 rounded-xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} />
            </div>

            {result?.error && (
                <div className="flex items-center gap-2 text-sm p-3 rounded-lg" style={{ color: "#ef4444", backgroundColor: "var(--surface-2)" }}>
                    <AlertTriangle className="w-4 h-4" />
                    {result.error}
                </div>
            )}

            <button
                type="submit"
                disabled={isPending || !passwordsMatch}
                className="w-full py-3 font-bold rounded-xl transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                style={{ backgroundColor: "var(--accent)", color: "var(--brand-sub)" }}
            >
                {isPending ? "가입 중..." : "가입하기"}
                {!isPending && <ArrowRight className="w-4 h-4" />}
            </button>
        </form>
    );
}
