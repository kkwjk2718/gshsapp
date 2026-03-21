import type { Metadata } from "next";
import { format } from "date-fns";
import Link from "next/link";
import { Megaphone, ShieldCheck } from "lucide-react";
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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
        <div className="flex items-center gap-3">
          <div className="p-3 rounded-full" style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}>
            <Megaphone className="w-6 h-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">공지사항</h1>
            <p style={{ color: "var(--muted)" }}>학교의 주요 소식을 확인하세요.</p>
          </div>
        </div>

        <NoticesCreateLink />
      </div>

      <div className="space-y-4">
        {notices.map((notice) => {
          const isAdmin = notice.writer.role === "ADMIN";
          const truncatedContent = notice.content.length > 150
            ? `${notice.content.substring(0, 150)}...`
            : notice.content;
          const showMoreLink = notice.content.length > 150;

          return (
            <Link
              key={notice.id}
              href={`/notices/${notice.id}`}
              className="block"
            >
              <div
                className="glass p-6 rounded-3xl hover:scale-[1.01] transition-all border-l-4 cursor-pointer"
                style={{ borderLeftColor: isAdmin ? "var(--accent)" : "var(--border)", backgroundColor: "var(--surface)" }}
              >
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-1 rounded-md text-xs font-bold" style={{ backgroundColor: "var(--surface-2)", color: isAdmin ? "var(--accent)" : "var(--muted)" }}>
                    {notice.category}
                  </span>
                  {isAdmin && <ShieldCheck className="w-4 h-4" style={{ color: "var(--accent)" }} />}
                  <span className="text-xs" style={{ color: "var(--muted)" }}>
                    {format(notice.createdAt, "yyyy.MM.dd")}
                  </span>
                </div>
                <h2 className="text-xl font-bold mb-2">{notice.title}</h2>
                <p className="leading-relaxed mb-2" style={{ color: "var(--muted)" }}>
                  {truncatedContent}
                </p>
                {showMoreLink && (
                  <span className="text-sm font-medium hover:underline" style={{ color: "var(--accent)" }}>
                    더 보기 →
                  </span>
                )}
                <div className="mt-4 pt-4 border-t flex items-center justify-between text-sm" style={{ borderColor: "var(--border)", color: "var(--muted)" }}>
                  <span>작성자: {notice.writer.name} {isAdmin ? "(관리자)" : ""}</span>
                  {!notice.expiresAt && (
                    <span className="text-xs px-2 py-1 rounded" style={{ backgroundColor: "var(--surface-2)", color: "var(--muted)" }}>
                      상시 공지
                    </span>
                  )}
                </div>
              </div>
            </Link>
          );
        })}

        {notices.length === 0 && (
          <div className="py-12 text-center text-slate-500">
            등록된 공지사항이 없습니다.
          </div>
        )}
      </div>
    </div>
  );
}
