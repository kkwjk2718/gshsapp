import type { Metadata } from "next";
import { Building2, ExternalLink, School, Users } from "lucide-react";
import { getRelatedSites } from "@/lib/public-content";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "교내 사이트",
  description: "경남과학고 주요 연계 사이트 모음입니다.",
};

export default async function SitesPage() {
  const sites = await getRelatedSites();

  const groupedSites = {
    OFFICIAL: sites.filter((site) => site.category === "OFFICIAL"),
    CLUB: sites.filter((site) => site.category === "CLUB"),
    COMMUNITY: sites.filter((site) => site.category === "COMMUNITY"),
    OTHER: sites.filter((site) => !["OFFICIAL", "CLUB", "COMMUNITY"].includes(site.category)),
  };

  const Section = ({
    title,
    icon: Icon,
    items,
  }: {
    title: string;
    icon: typeof School;
    items: typeof sites;
  }) => {
    if (items.length === 0) {
      return null;
    }

    return (
      <div className="space-y-4">
        <h2 className="flex items-center gap-2 text-xl font-bold text-slate-800 dark:text-slate-200">
          <Icon className="h-6 w-6 text-indigo-500" />
          {title}
        </h2>
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {items.map((site) => (
            <a
              key={site.id}
              href={site.url}
              target="_blank"
              rel="noopener noreferrer"
              className="glass group flex items-start justify-between rounded-2xl p-5 transition-all hover:-translate-y-1 hover:border-indigo-500/50"
            >
              <div>
                <div className="text-lg font-bold text-slate-800 transition-colors group-hover:text-indigo-600 dark:text-slate-100 dark:group-hover:text-indigo-400">
                  {site.name}
                </div>
                {site.description ? (
                  <div className="mt-1 text-sm text-slate-500">{site.description}</div>
                ) : null}
              </div>
              <ExternalLink className="h-5 w-5 text-slate-400 transition-colors group-hover:text-indigo-500" />
            </a>
          ))}
        </div>
      </div>
    );
  };

  return (
    <div className="mobile-page mobile-safe-bottom mx-auto max-w-6xl space-y-12">
      <div className="mb-12 space-y-2 text-center">
        <h1 className="text-3xl font-bold text-slate-900 dark:text-white">교내 연계 사이트</h1>
        <p className="text-slate-500">
          학교 생활에 필요한 공식 사이트와 커뮤니티 링크를 한곳에 모았습니다.
        </p>
      </div>

      <div className="space-y-12">
        <Section title="학교 · 공식 기관" icon={School} items={groupedSites.OFFICIAL} />
        <Section title="동아리 · 학생 활동" icon={Users} items={groupedSites.CLUB} />
        <Section
          title="커뮤니티 · 기타"
          icon={Building2}
          items={[...groupedSites.COMMUNITY, ...groupedSites.OTHER]}
        />

        {sites.length === 0 ? (
          <div className="glass rounded-3xl py-20 text-center text-slate-500">
            등록된 사이트가 없습니다.
          </div>
        ) : null}
      </div>
    </div>
  );
}
