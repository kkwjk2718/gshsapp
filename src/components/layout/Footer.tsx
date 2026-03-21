import Link from "next/link";
import { AlertTriangle, BarChart3, ExternalLink, Shield, Sparkles } from "lucide-react";

export function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="mt-12 px-4 pb-8 md:px-6 md:pb-10">
      <div className="mx-auto grid w-full max-w-[1360px] gap-4 rounded-[2rem] border px-5 py-6 backdrop-blur-2xl md:grid-cols-[minmax(0,1.3fr)_minmax(360px,0.9fr)] md:px-6">
        <div className="glass-muted p-5">
          <div className="section-kicker">Platform</div>
          <div className="mt-2 flex items-center gap-3">
            <div className="icon-badge h-11 w-11 rounded-[1.25rem]">
              <Sparkles className="h-[18px] w-[18px]" />
            </div>
            <div>
              <p className="text-lg font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
                GSHS.app
              </p>
              <p className="text-sm" style={{ color: "var(--muted)" }}>
                경남과학고 학생 생활을 위한 통합 서비스
              </p>
            </div>
          </div>

          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <div className="glass-muted px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
                Built by
              </p>
              <p className="mt-2 text-sm font-medium" style={{ color: "var(--foreground)" }}>
                경남과학고등학교 정보부
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                Developed by 김건우
              </p>
            </div>

            <div className="glass-muted px-4 py-3">
              <p className="text-[11px] font-semibold uppercase tracking-[0.18em]" style={{ color: "var(--muted)" }}>
                Availability
              </p>
              <p className="mt-2 text-sm font-medium" style={{ color: "var(--foreground)" }}>
                학교 정보를 빠르게 확인하는 학생용 허브
              </p>
              <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                급식, 시간표, 일정, 공지, 관리자 기능을 하나의 화면 흐름 안에 정리했습니다.
              </p>
            </div>
          </div>

          <p className="mt-4 text-xs" style={{ color: "var(--muted)" }}>
            © {currentYear} GSHS Information Department. All rights reserved.
          </p>
        </div>

        <div className="grid gap-4">
          <div className="glass-muted p-5">
            <div className="section-kicker">Quick Access</div>
            <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
              <Link
                href="/help"
                className="flex items-center justify-between rounded-[1.1rem] border px-4 py-3 transition-all hover:-translate-y-0.5"
                style={{ borderColor: "color-mix(in srgb, var(--border) 66%, transparent)", color: "var(--foreground)" }}
              >
                이용 안내
                <ExternalLink className="h-4 w-4" style={{ color: "var(--muted)" }} />
              </Link>
              <Link
                href="/privacy"
                className="flex items-center justify-between rounded-[1.1rem] border px-4 py-3 transition-all hover:-translate-y-0.5"
                style={{ borderColor: "color-mix(in srgb, var(--border) 66%, transparent)", color: "var(--foreground)" }}
              >
                개인정보처리방침
                <Shield className="h-4 w-4" style={{ color: "var(--muted)" }} />
              </Link>
              <Link
                href="/stats"
                className="flex items-center justify-between rounded-[1.1rem] border px-4 py-3 transition-all hover:-translate-y-0.5"
                style={{ borderColor: "color-mix(in srgb, var(--border) 66%, transparent)", color: "var(--foreground)" }}
              >
                서버 통계
                <BarChart3 className="h-4 w-4" style={{ color: "var(--muted)" }} />
              </Link>
              <a
                href="https://gshs-h.gne.go.kr"
                target="_blank"
                rel="noreferrer"
                className="flex items-center justify-between rounded-[1.1rem] border px-4 py-3 transition-all hover:-translate-y-0.5"
                style={{ borderColor: "color-mix(in srgb, var(--border) 66%, transparent)", color: "var(--foreground)" }}
              >
                학교 홈페이지
                <ExternalLink className="h-4 w-4" style={{ color: "var(--muted)" }} />
              </a>
            </div>
          </div>

          <div className="glass-muted flex flex-col gap-3 p-5 md:flex-row md:items-center md:justify-between">
            <div>
              <div className="section-kicker">Feedback</div>
              <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
                문제를 발견했거나 개선 아이디어가 있다면 바로 전달해 주세요.
              </p>
            </div>
            <Link
              href="/report"
              className="inline-flex items-center gap-2 rounded-[1.15rem] border px-4 py-3 text-sm font-semibold transition-all hover:-translate-y-0.5"
              style={{
                background: "color-mix(in srgb, var(--danger) 14%, var(--surface) 86%)",
                borderColor: "color-mix(in srgb, var(--danger) 30%, transparent)",
                color: "var(--foreground)",
              }}
            >
              <AlertTriangle className="h-4 w-4" />
              오류 신고
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
