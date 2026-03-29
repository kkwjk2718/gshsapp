import type { Metadata } from "next";
import Link from "next/link";
import { Clock3, Megaphone, ShieldCheck } from "lucide-react";
import { formatKST } from "@/lib/date-utils";
import { formatNoticeWindowLabel } from "@/lib/notice-window";
import { getVisibleNotices } from "@/lib/public-content";
import { NoticesCreateLink } from "./notices-create-link";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "공지사항",
  description: "학교의 주요 공지사항과 소식을 확인하세요.",
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
    <div className="mobile-page mobile-safe-bottom space-y-6">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(breadcrumbJsonLd) }} />

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-3">
          <div className="rounded-full p-3" style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}>
            <Megaphone className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">공지사항</h1>
            <p style={{ color: "var(--muted)" }}>학교의 주요 소식과 안내를 확인하세요.</p>
          </div>
        </div>

        <NoticesCreateLink />
      </div>

      <div className="space-y-4">
        {notices.map((notice) => {
          const isAdmin = notice.writer.role === "ADMIN";
          const truncatedContent = notice.content.length > 150 ? `${notice.content.substring(0, 150)}...` : notice.content;
          const showMoreLink = notice.content.length > 150;

          return (
            <Link key={notice.id} href={`/notices/${notice.id}`} className="block">
              <div
                className="glass cursor-pointer rounded-3xl border-l-4 p-6 transition-all hover:scale-[1.01]"
                style={{ borderLeftColor: isAdmin ? "var(--accent)" : "var(--border)", backgroundColor: "var(--surface)" }}
              >
                <div className="mb-2 flex items-center gap-2">
                  <span
                    className="rounded-md px-2 py-1 text-xs font-bold"
                    style={{ backgroundColor: "var(--surface-2)", color: isAdmin ? "var(--accent)" : "var(--muted)" }}
                  >
                    {notice.category}
                  </span>
                  {isAdmin && <ShieldCheck className="h-4 w-4" style={{ color: "var(--accent)" }} />}
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {formatKST(notice.createdAt, "yyyy.MM.dd")}
                  </span>
                </div>

                <h2 className="mb-2 text-xl font-bold">{notice.title}</h2>

                <p className="mb-3 leading-relaxed" style={{ color: "var(--muted)" }}>
                  {truncatedContent}
                </p>

                {showMoreLink && (
                  <span className="text-sm font-medium hover:underline" style={{ color: "var(--accent)" }}>
                    더보기 →
                  </span>
                )}

                <div className="mt-4 space-y-3 border-t pt-4 text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      작성자: {notice.writer.name} {isAdmin ? "(관리자)" : ""}
                    </span>
                    <div className="flex items-center gap-2 text-xs">
                      <Clock3 className="h-4 w-4" />
                      <span>{formatNoticeWindowLabel(notice)}</span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          );
        })}

        {notices.length === 0 && <div className="py-12 text-center text-slate-500">등록된 공지사항이 없습니다.</div>}
      </div>
    </div>
  );
}
