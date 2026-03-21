import type { Metadata } from "next";
import { format } from "date-fns";
import Link from "next/link";
import { ArrowRight, Megaphone, ShieldCheck } from "lucide-react";
import { getVisibleNotices } from "@/lib/public-content";
import { NoticesCreateLink } from "./notices-create-link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "공지사항",
  description: "학교의 주요 공지사항과 최신 소식을 확인하세요.",
  alternates: { canonical: "/notices" },
};

export default async function NoticesPage() {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gshs.app";
  const notices = await getVisibleNotices();

  const breadcrumbJsonLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "홈", item: `${baseUrl}/` },
      { "@type": "ListItem", position: 2, name: "공지사항", item: `${baseUrl}/notices` },
    ],
  };

  return (
    <div className="page-shell">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <div className="page-shell-narrow space-y-4 md:space-y-5">
        <section className="glass-strong px-5 py-5 md:px-6 md:py-6">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="info-chip">총 {notices.length}개의 공지</span>
                <span className="info-chip">최신 학교 소식 모아보기</span>
              </div>

              <div className="flex items-start gap-3">
                <div className="icon-badge mt-0.5">
                  <Megaphone className="h-4 w-4" />
                </div>
                <div>
                  <div className="section-kicker">Notice Center</div>
                  <h1 className="section-title mt-1">공지사항</h1>
                  <p className="section-copy mt-3 max-w-2xl">
                    학교에서 전달하는 주요 안내와 운영 공지를 빠르게 확인할 수 있습니다.
                    중요한 공지는 더 짧고 읽기 쉬운 카드 구조로 정리했습니다.
                  </p>
                </div>
              </div>
            </div>

            <div className="flex flex-col gap-2 sm:flex-row">
              <div className="glass-muted px-4 py-3 text-sm" style={{ color: "var(--muted)" }}>
                관리자 공지와 일반 공지를 한 번에 탐색할 수 있습니다.
              </div>
              <NoticesCreateLink />
            </div>
          </div>
        </section>

        {notices.length > 0 ? (
          <section className="grid gap-4 xl:grid-cols-2">
            {notices.map((notice) => {
              const isAdmin = notice.writer.role === "ADMIN";
              const truncatedContent = notice.content.length > 160
                ? `${notice.content.substring(0, 160)}...`
                : notice.content;

              return (
                <Link key={notice.id} href={`/notices/${notice.id}`} className="glass-card glass-card-hover block p-5 md:p-6">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2">
                      <span
                        className="rounded-full border px-3 py-1 text-[11px] font-semibold"
                        style={{
                          backgroundColor: "color-mix(in srgb, var(--surface-2) 82%, transparent)",
                          borderColor: "color-mix(in srgb, var(--border) 72%, transparent)",
                          color: isAdmin ? "var(--accent)" : "var(--muted)",
                        }}
                      >
                        {notice.category}
                      </span>
                      {isAdmin ? <ShieldCheck className="h-4 w-4 shrink-0" style={{ color: "var(--accent)" }} /> : null}
                    </div>
                    <span className="shrink-0 text-xs" style={{ color: "var(--muted)" }}>
                      {format(notice.createdAt, "yyyy.MM.dd")}
                    </span>
                  </div>

                  <div className="mt-4 space-y-3">
                    <h2 className="line-clamp-2 text-[1.18rem] font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
                      {notice.title}
                    </h2>
                    <p className="line-clamp-4 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
                      {truncatedContent}
                    </p>
                  </div>

                  <div
                    className="mt-5 flex items-center justify-between border-t pt-4 text-sm"
                    style={{
                      borderColor: "color-mix(in srgb, var(--border) 68%, transparent)",
                      color: "var(--muted)",
                    }}
                  >
                    <span>
                      작성자 {notice.writer.name}
                      {isAdmin ? " · 관리자" : ""}
                    </span>
                    <span className="inline-flex items-center gap-1.5 font-medium" style={{ color: "var(--accent)" }}>
                      상세 보기
                      <ArrowRight className="h-4 w-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </section>
        ) : (
          <section className="glass-card p-10 text-center">
            <div className="section-kicker">Empty State</div>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
              등록된 공지사항이 없습니다
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              새로운 공지가 등록되면 이 화면에서 가장 먼저 확인할 수 있습니다.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
