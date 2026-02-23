import type { Metadata } from "next";
import { SignupForm } from "./signup-form";
import Link from "next/link";
import { Ticket } from "lucide-react";
import { TokenInput } from "./token-input";

export const metadata: Metadata = {
  title: "회원가입",
  description: "관리자 토큰으로 GSHS.app 회원가입을 진행하세요.",
  robots: { index: false, follow: false },
  alternates: { canonical: "/signup" },
};

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token: searchToken } = await searchParams;
  const token = searchToken || "";

  return (
    <div className="min-h-[100dvh] flex items-center justify-center p-4" style={{ backgroundColor: "var(--background)" }}>
      <div className="w-full max-w-sm p-6 sm:p-8 rounded-3xl shadow-xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}>
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold" style={{ color: "var(--foreground)" }}>GSHS.app</h1>
          <p className="mt-2" style={{ color: "var(--muted)" }}>회원가입</p>
        </div>

        {token ? (
          <>
            <div className="flex items-center gap-2 p-3 mb-4 rounded-xl" style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}>
              <Ticket className="w-5 h-5" />
              <span className="font-mono text-sm font-bold">{token}</span>
            </div>
            <SignupForm token={token} />
          </>
        ) : (
          <TokenInput />
        )}

        <div className="mt-6 text-center text-sm" style={{ color: "var(--muted)" }}>
          이미 계정이 있으신가요? <Link href="/login" className="hover:underline" style={{ color: "var(--accent)" }}>로그인</Link>
        </div>
      </div>
    </div>
  );
}