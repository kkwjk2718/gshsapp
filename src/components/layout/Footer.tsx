import Link from "next/link";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 dark:border-slate-800 mt-12 py-8 text-center text-sm text-slate-500">
      <div className="max-w-5xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="text-left">
          <p className="font-semibold text-slate-700 dark:text-slate-300">GSHS.app</p>
          <p className="text-xs mt-1">경남과학고등학교 정보부 &middot; Developed by 김건우</p>
          <p className="text-xs mt-1">&copy; {currentYear} GSHS Information Department. All rights reserved.</p>
        </div>
        <div className="flex flex-col md:flex-row gap-4 text-xs items-center">
          <div className="flex gap-4">
            <Link href="/about" className="hover:text-indigo-500 transition-colors">서비스 소개</Link>
            <Link href="/privacy" className="hover:text-indigo-500 transition-colors">개인정보처리방침</Link>
            <Link href="/stats" className="hover:text-indigo-500 transition-colors">서버 통계</Link>
            <a href="https://gshs-h.gne.go.kr" target="_blank" rel="noreferrer" className="hover:text-indigo-500 transition-colors">학교 홈페이지</a>
          </div>
          <div className="md:ml-4 md:pl-4 md:border-l border-slate-700">
            <Link href="/report" className="px-3 py-1.5 rounded-lg bg-rose-500/10 border border-rose-500/30 text-rose-400 hover:bg-rose-500/20 transition-colors font-medium inline-flex items-center gap-1.5">
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              오류 신고
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
