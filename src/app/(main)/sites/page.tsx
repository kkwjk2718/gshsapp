import type { Metadata } from "next";
import type { LucideIcon } from "lucide-react";
import { Building2, ExternalLink, School, Users } from "lucide-react";
import { getRelatedSites } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "교내 사이트",
  description: "학교와 관련된 공식 사이트, 동아리, 커뮤니티 링크를 한곳에서 확인하세요.",
};

function SiteSection({
  title,
  description,
  icon: Icon,
  items,
}: {
  title: string;
  description: string;
  icon: LucideIcon;
  items: Array<{
    id: string;
    name: string;
    description?: string | null;
    url: string;
  }>;
}) {
  if (items.length === 0) {
    return null;
  }

  return (
    <section className="glass-card p-5 md:p-6">
      <div className="flex items-start gap-3">
        <div className="icon-badge">
          <Icon className="h-4 w-4" />
        </div>
        <div className="min-w-0">
          <div className="section-kicker">{title}</div>
          <h2 className="mt-1 text-[1.18rem] font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
            {title}
          </h2>
          <p className="mt-2 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
            {description}
          </p>
        </div>
      </div>

      <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        {items.map((site) => (
          <a
            key={site.id}
            href={site.url}
            target="_blank"
            rel="noopener noreferrer"
            className="glass-card glass-card-hover flex items-start justify-between gap-3 p-4"
          >
            <div className="min-w-0">
              <div className="line-clamp-1 text-sm font-semibold" style={{ color: "var(--foreground)" }}>
                {site.name}
              </div>
              {site.description ? (
                <p className="mt-2 line-clamp-3 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                  {site.description}
                </p>
              ) : (
                <p className="mt-2 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>
                  링크를 열어 자세한 내용을 확인하세요.
                </p>
              )}
            </div>
            <ExternalLink className="mt-0.5 h-4 w-4 shrink-0" style={{ color: "var(--muted)" }} />
          </a>
        ))}
      </div>
    </section>
  );
}

export default async function SitesPage() {
  const sites = await getRelatedSites();

  const groupedSites = {
    OFFICIAL: sites.filter((site) => site.category === "OFFICIAL"),
    CLUB: sites.filter((site) => site.category === "CLUB"),
    COMMUNITY: sites.filter((site) => site.category === "COMMUNITY"),
    OTHER: sites.filter((site) => !["OFFICIAL", "CLUB", "COMMUNITY"].includes(site.category)),
  };

  return (
    <div className="page-shell">
      <div className="page-shell-narrow space-y-4 md:space-y-5">
        <section className="glass-strong px-5 py-5 md:px-6 md:py-6">
          <div className="flex flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="info-chip">총 {sites.length}개 사이트</span>
                <span className="info-chip">학교 관련 링크를 한곳에 정리</span>
              </div>

              <div>
                <div className="section-kicker">Related Links</div>
                <h1 className="section-title mt-1">교내 사이트</h1>
                <p className="section-copy mt-3 max-w-2xl">
                  공식 학교 사이트부터 동아리, 커뮤니티 링크까지 필요한 경로를 빠르게 찾아갈 수 있도록 정리했습니다.
                </p>
              </div>
            </div>

            <div className="glass-muted px-4 py-3 text-sm" style={{ color: "var(--muted)" }}>
              새 창에서 열리며, 학교 관련 링크를 빠르게 탐색할 수 있습니다.
            </div>
          </div>
        </section>

        {sites.length > 0 ? (
          <div className="space-y-4">
            <SiteSection
              title="공식 사이트"
              description="학교 운영과 직접 연결된 공식 링크 모음입니다."
              icon={School}
              items={groupedSites.OFFICIAL}
            />
            <SiteSection
              title="동아리 및 학생 활동"
              description="학생 활동과 동아리에서 운영하는 사이트를 모았습니다."
              icon={Users}
              items={groupedSites.CLUB}
            />
            <SiteSection
              title="커뮤니티 및 기타"
              description="추가로 참고할 수 있는 커뮤니티와 기타 관련 링크입니다."
              icon={Building2}
              items={[...groupedSites.COMMUNITY, ...groupedSites.OTHER]}
            />
          </div>
        ) : (
          <section className="glass-card p-10 text-center">
            <div className="section-kicker">Empty State</div>
            <h2 className="mt-2 text-xl font-semibold tracking-[-0.04em]" style={{ color: "var(--foreground)" }}>
              등록된 사이트가 없습니다
            </h2>
            <p className="mt-3 text-sm leading-relaxed" style={{ color: "var(--muted)" }}>
              추후 관련 사이트가 등록되면 이 화면에서 한 번에 확인할 수 있습니다.
            </p>
          </section>
        )}
      </div>
    </div>
  );
}
