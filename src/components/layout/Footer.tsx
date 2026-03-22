import Link from "next/link";

const serviceLinks = [
  { label: "도움말", href: "/help" },
  { label: "개인정보 처리방침", href: "/privacy" },
  { label: "서비스 통계", href: "/stats" },
];

const externalLinks = [
  { label: "학교 홈페이지", href: "https://gshs-h.gne.go.kr" },
  { label: "GitHub", href: "https://github.com/kkwjk2718/gshsapp" },
];

const sidePageLinks = [
  {
    label: "About",
    href: "https://kkwjk2718.github.io/gshs-about-pages/",
    description: "서비스 소개와 핵심 개요",
  },
  {
    label: "Docs",
    href: "https://kkwjk2718.github.io/gshs-docs-pages/",
    description: "사용법과 자주 묻는 질문",
  },
  {
    label: "Status",
    href: "https://kkwjk2718.github.io/gshs-status-pages/",
    description: "gshs.app 운영 상태 확인",
  },
  {
    label: "Updates",
    href: "https://kkwjk2718.github.io/gshs-updates-pages/",
    description: "배포 이력과 업데이트 소식",
  },
];

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-12 border-t border-slate-200 py-8 text-sm text-slate-500 dark:border-slate-800">
      <div className="mx-auto flex max-w-5xl flex-col gap-5 px-4 md:flex-row md:items-start md:justify-between">
        <div className="text-left">
          <p className="font-semibold text-slate-700 dark:text-slate-300">GSHS.app</p>
          <p className="mt-1 text-xs">경남과학고등학교 정보부 · IEUM</p>
          <p className="mt-1 text-xs">&copy; {currentYear} GSHS.app. All rights reserved.</p>
        </div>

        <div className="flex flex-1 flex-col items-center gap-4 text-xs md:items-end">
          <div className="flex flex-wrap items-center justify-center gap-4 md:justify-end">
            {serviceLinks.map((link) => (
              <Link key={link.href} href={link.href} className="transition-colors hover:text-indigo-500">
                {link.label}
              </Link>
            ))}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 md:justify-end">
            {externalLinks.map((link) => (
              <a
                key={link.href}
                href={link.href}
                target="_blank"
                rel="noreferrer"
                className="transition-colors hover:text-indigo-500"
              >
                {link.label}
              </a>
            ))}

            <details className="group relative">
              <summary className="list-none cursor-pointer rounded-lg border border-slate-200 px-3 py-1.5 font-medium text-slate-600 transition hover:border-indigo-400 hover:text-indigo-500 dark:border-slate-700 dark:text-slate-300">
                Sites
              </summary>

              <div className="mt-3 w-full min-w-[18rem] max-w-sm rounded-2xl border border-slate-200 bg-white/95 p-3 shadow-xl backdrop-blur md:absolute md:right-0 md:mt-2 dark:border-slate-700 dark:bg-slate-900/95">
                <div className="mb-2 text-left text-[11px] font-semibold uppercase tracking-[0.18em] text-slate-400">
                  사이드 페이지
                </div>
                <div className="grid gap-2">
                  {sidePageLinks.map((link) => (
                    <a
                      key={link.href}
                      href={link.href}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-slate-200 px-3 py-2 text-left transition hover:border-indigo-400 hover:bg-indigo-50/70 dark:border-slate-700 dark:hover:bg-slate-800"
                    >
                      <div className="font-semibold text-slate-700 dark:text-slate-100">{link.label}</div>
                      <div className="mt-0.5 text-[11px] text-slate-500">{link.description}</div>
                    </a>
                  ))}
                </div>
              </div>
            </details>
          </div>

          <div>
            <Link
              href="/report"
              className="inline-flex items-center gap-1.5 rounded-lg border border-rose-500/30 bg-rose-500/10 px-3 py-1.5 font-medium text-rose-400 transition-colors hover:bg-rose-500/20"
            >
              <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              오류 신고
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
