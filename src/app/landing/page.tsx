import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, Calendar, Utensils, Bell, Wrench, Shield } from "lucide-react";

export const metadata: Metadata = {
  title: "GSHS.app 소개",
  description: "경남과학고 학생 통합 플랫폼 소개 페이지입니다.",
  alternates: { canonical: "/landing" },
};

const features = [
  {
    icon: Utensils,
    title: "급식",
    desc: "조식/중식/석식과 알레르기 정보를 빠르게 확인합니다.",
  },
  {
    icon: Calendar,
    title: "학사일정",
    desc: "시험, 행사, 휴일을 한 화면에서 정리해 보여줍니다.",
  },
  {
    icon: Bell,
    title: "공지",
    desc: "중요한 공지를 놓치지 않도록 앱 안에서 바로 확인합니다.",
  },
  {
    icon: Wrench,
    title: "도구",
    desc: "학교 생활에서 자주 쓰는 유틸리티를 모아 제공합니다.",
  },
  {
    icon: Shield,
    title: "권한 기반",
    desc: "학생/교사/방송부/관리자 권한에 맞는 화면을 제공합니다.",
  },
];

export default function LandingPage() {
  const websiteJsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "GSHS.app",
    url: process.env.NEXT_PUBLIC_APP_URL || "https://gshs.app",
    inLanguage: "ko-KR",
    description: "경남과학고 학생 통합 플랫폼",
  };

  return (
    <div className="min-h-screen bg-[#090a0b] text-[#f5f7fa]">
      <div className="mx-auto max-w-6xl px-5 sm:px-8">
        <header className="sticky top-0 z-40 border-b border-white/10 bg-[#090a0b]/80 backdrop-blur-md">
          <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-1">
            <div className="text-sm font-semibold tracking-wide text-white/90">GSHS.app</div>
            <Link
              href="/"
              className="rounded-md border border-white/15 bg-white/5 px-4 py-2 text-sm font-medium text-white/90 hover:bg-white/10 transition-colors"
            >
              앱 열기
            </Link>
          </div>
        </header>

        <main className="py-16 sm:py-24">
          <section className="mx-auto max-w-4xl text-center">
            <p className="mb-5 inline-flex rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs text-white/70">
              경남과학고 생활을 위한 심플한 플랫폼
            </p>
            <h1 className="text-4xl sm:text-6xl font-semibold tracking-tight leading-tight">
              학교 생활,
              <br className="hidden sm:block" />
              <span className="text-white/80">더 단순하고 빠르게</span>
            </h1>
            <p className="mx-auto mt-6 max-w-2xl text-sm sm:text-base text-white/60 leading-relaxed">
              급식, 시간표, 공지, 학사일정, 유틸리티를 한곳에 모았습니다.
              복잡한 정보는 줄이고, 필요한 기능만 빠르게 접근하도록 구성했습니다.
            </p>
            <div className="mt-10 flex items-center justify-center">
              <Link
                href="/"
                className="inline-flex items-center justify-center gap-2 rounded-lg bg-white text-[#090a0b] px-6 py-3 text-sm font-semibold hover:bg-white/90 transition-colors"
              >
                시작하기 <ArrowRight className="w-4 h-4" />
              </Link>
            </div>
          </section>

          <section className="mt-16 sm:mt-24">
            <div className="rounded-2xl border border-white/15 bg-gradient-to-b from-[#17191d] to-[#101215] p-5 sm:p-8 shadow-[0_20px_70px_rgba(0,0,0,0.35)]">
              <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-3 mb-5">
                <div>
                  <p className="text-xs text-white/55 mb-2">오늘의 요약</p>
                  <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight">오늘 필요한 정보만 빠르게</h2>
                </div>
                <Link href="/" className="text-sm text-white/70 hover:text-white transition-colors">
                  바로 확인하기 →
                </Link>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-4">
                  <p className="text-[11px] text-white/50 mb-1">급식</p>
                  <p className="text-sm sm:text-base font-medium text-white/90">중식 / 석식 메뉴 확인</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-4">
                  <p className="text-[11px] text-white/50 mb-1">시간표</p>
                  <p className="text-sm sm:text-base font-medium text-white/90">학년·반 기준 즉시 조회</p>
                </div>
                <div className="rounded-lg border border-white/10 bg-black/20 px-4 py-4">
                  <p className="text-[11px] text-white/50 mb-1">공지</p>
                  <p className="text-sm sm:text-base font-medium text-white/90">최신 공지 빠른 접근</p>
                </div>
              </div>

            </div>
          </section>

          <section className="mt-16 sm:mt-24">
            <h2 className="text-xl sm:text-2xl font-semibold mb-6">핵심 기능</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {features.map((f) => (
                <div key={f.title} className="rounded-2xl border border-white/10 bg-[#111216] p-5">
                  <div className="mb-4 inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 bg-white/5">
                    <f.icon className="w-5 h-5 text-white/80" />
                  </div>
                  <h3 className="text-base font-semibold text-white/90">{f.title}</h3>
                  <p className="mt-2 text-sm text-white/60 leading-relaxed">{f.desc}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8 sm:mt-10" aria-label="회원가입 안내">
            <div className="rounded-xl border border-white/10 bg-[#111216] px-5 py-4 sm:px-6 sm:py-5">
              <p className="text-[11px] text-white/50 mb-1">회원가입 안내</p>
              <p className="text-sm sm:text-base text-white/85 leading-relaxed">
                회원가입은 <span className="font-semibold">관리자가 발급한 초대 토큰</span>으로 진행됩니다.
                <span className="text-white/65"> /signup → 토큰 입력 → 계정 정보 작성</span>
                {' '}순서로 가입을 완료할 수 있어요.
              </p>
            </div>
          </section>
        </main>

        <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(websiteJsonLd) }} />

        <footer className="border-t border-white/10 py-8 text-xs text-white/45">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <p>© 2026 GSHS.app</p>
            <div className="flex items-center gap-4">
              <Link href="/privacy" className="hover:text-white/70 transition-colors">개인정보처리방침</Link>
              <Link href="/help" className="hover:text-white/70 transition-colors">도움말</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
