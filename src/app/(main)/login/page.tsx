"use client";

import Link from "next/link";
import { useActionState } from "react";
import { ArrowRight, Loader2, Lock, ShieldCheck, Sparkles, User } from "lucide-react";
import { authenticate } from "@/lib/actions";

export default function LoginPage() {
  const [errorMessage, dispatch, isPending] = useActionState(authenticate, undefined);

  return (
    <div className="relative flex min-h-[100dvh] items-center justify-center overflow-hidden px-4 py-10">
      <div className="hero-orb left-[-6rem] top-[-4rem] h-52 w-52 bg-[color:var(--accent-glow)]" />
      <div className="hero-orb right-[-7rem] bottom-[-6rem] h-64 w-64 bg-[color:var(--panel-glow)] [animation-delay:-6s]" />

      <div className="relative z-10 grid w-full max-w-6xl gap-4 lg:grid-cols-[minmax(0,1.08fr)_minmax(380px,0.92fr)]">
        <section className="glass-strong hidden overflow-hidden px-7 py-7 lg:flex lg:flex-col lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="info-chip">
                <Sparkles className="h-3.5 w-3.5" />
                Student Product
              </span>
              <span className="info-chip">
                <ShieldCheck className="h-3.5 w-3.5" />
                Secure Sign In
              </span>
            </div>

            <div className="mt-8 max-w-xl">
              <div className="section-kicker">Unified School Platform</div>
              <h1 className="mt-2 text-[2.65rem] font-semibold tracking-[-0.055em]" style={{ color: "var(--foreground)" }}>
                GSHS.app에 로그인하고
                <br />
                오늘 필요한 정보를 바로 확인하세요.
              </h1>
              <p className="mt-4 text-base leading-relaxed" style={{ color: "var(--muted)" }}>
                개인 시간표, 학사 일정, 알림, 관리 기능까지 학교 생활에 필요한 핵심 화면을 하나의 계정으로 이용할 수 있습니다.
              </p>
            </div>

            <div className="mt-8 grid gap-3 sm:grid-cols-2">
              {[
                {
                  icon: Sparkles,
                  title: "즉시 접근",
                  copy: "로그인 후 시간표와 맞춤 정보로 바로 이동할 수 있습니다.",
                },
                {
                  icon: ShieldCheck,
                  title: "안정적인 운영",
                  copy: "관리자 기능과 공용 기능이 같은 플랫폼 위에서 함께 동작합니다.",
                },
              ].map((item) => (
                <div key={item.title} className="glass-card p-5">
                  <div className="icon-badge">
                    <item.icon className="h-4 w-4" />
                  </div>
                  <div className="mt-4 text-base font-semibold" style={{ color: "var(--foreground)" }}>
                    {item.title}
                  </div>
                  <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                    {item.copy}
                  </p>
                </div>
              ))}
            </div>
          </div>

          <div className="glass-muted mt-8 px-4 py-4 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            학생과 교사를 위한 학교 생활 허브로 설계되었으며, 로그인 후 개인화된 정보를 더 빠르게 확인할 수 있습니다.
          </div>
        </section>

        <section className="glass-card px-5 py-6 md:px-7 md:py-7">
          <div className="mx-auto w-full max-w-md">
            <div className="mb-8">
              <div className="section-kicker">Sign In</div>
              <h1 className="mt-2 text-[2rem] font-semibold tracking-[-0.05em]" style={{ color: "var(--foreground)" }}>
                로그인
              </h1>
              <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                아이디와 비밀번호를 입력하면 개인 시간표와 관리자 기능을 포함한 서비스에 접근할 수 있습니다.
              </p>
            </div>

            <form action={dispatch} className="space-y-4">
              <div className="space-y-2">
                <label htmlFor="userId" className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                  아이디
                </label>
                <div className="relative">
                  <User className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--muted)" }} />
                  <input
                    id="userId"
                    name="userId"
                    type="text"
                    autoComplete="username"
                    placeholder="아이디를 입력하세요"
                    required
                    className="input-glass pl-11"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <label htmlFor="password" className="text-sm font-medium" style={{ color: "var(--foreground)" }}>
                  비밀번호
                </label>
                <div className="relative">
                  <Lock className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2" style={{ color: "var(--muted)" }} />
                  <input
                    id="password"
                    name="password"
                    type="password"
                    autoComplete="current-password"
                    placeholder="비밀번호를 입력하세요"
                    required
                    minLength={4}
                    className="input-glass pl-11"
                  />
                </div>
              </div>

              <label className="glass-muted flex cursor-pointer items-center gap-3 px-4 py-3 text-sm" style={{ color: "var(--muted)" }}>
                <input
                  type="checkbox"
                  id="keepLoggedIn"
                  defaultChecked
                  className="h-4 w-4 rounded border-[color:var(--border)] accent-[color:var(--accent)]"
                />
                로그인 상태 유지
              </label>

              <div className="flex min-h-8 items-end" aria-live="polite" aria-atomic="true">
                {errorMessage ? (
                  <p className="text-sm font-medium" style={{ color: "var(--danger)" }}>
                    {errorMessage}
                  </p>
                ) : null}
              </div>

              <button type="submit" disabled={isPending} className="btn-primary min-h-[3.3rem] w-full text-base">
                {isPending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    로그인 중...
                  </>
                ) : (
                  <>
                    로그인
                    <ArrowRight className="h-5 w-5" />
                  </>
                )}
              </button>
            </form>

            <div className="mt-6 rounded-[1.25rem] border px-4 py-4 text-sm" style={{ borderColor: "color-mix(in srgb, var(--border) 72%, transparent)", color: "var(--muted)" }}>
              계정이 아직 없다면
              <Link href="/signup" className="ml-1 font-semibold hover:underline" style={{ color: "var(--accent)" }}>
                회원가입
              </Link>
              으로 이동해 새 계정을 만들 수 있습니다.
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}
