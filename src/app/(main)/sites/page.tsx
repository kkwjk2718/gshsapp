import { prisma } from "@/lib/db";
import { Building2, ExternalLink, School, Users } from "lucide-react";
import { Metadata } from "next";

export const metadata: Metadata = {
    title: "교내 사이트",
    description: "경남과학고등학교 주요 연계 사이트 모음입니다.",
};

export default async function SitesPage() {
    const sites = await prisma.relatedSite.findMany({
        orderBy: { createdAt: "desc" },
    });

    // Group by category
    const groupedSites = {
        OFFICIAL: sites.filter(s => s.category === 'OFFICIAL'),
        CLUB: sites.filter(s => s.category === 'CLUB'),
        COMMUNITY: sites.filter(s => s.category === 'COMMUNITY'),
        OTHER: sites.filter(s => !['OFFICIAL', 'CLUB', 'COMMUNITY'].includes(s.category)),
    };

    const Section = ({ title, icon: Icon, items }: { title: string, icon: any, items: typeof sites }) => {
        if (items.length === 0) return null;
        return (
            <div className="space-y-4">
                <h2 className="text-xl font-bold flex items-center gap-2 text-slate-800 dark:text-slate-200">
                    <Icon className="w-6 h-6 text-indigo-500" />
                    {title}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {items.map(site => (
                        <a
                            key={site.id}
                            href={site.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="glass p-5 rounded-2xl flex items-start justify-between group hover:border-indigo-500/50 transition-all hover:-translate-y-1"
                        >
                            <div>
                                <div className="font-bold text-lg text-slate-800 dark:text-slate-100 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                                    {site.name}
                                </div>
                                {site.description && (
                                    <div className="text-sm text-slate-500 mt-1">{site.description}</div>
                                )}
                            </div>
                            <ExternalLink className="w-5 h-5 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                        </a>
                    ))}
                </div>
            </div>
        );
    };

    return (
        <div className="p-4 md:p-8 space-y-12 max-w-6xl mx-auto">
            <div className="text-center space-y-2 mb-12">
                <h1 className="text-3xl font-bold text-slate-900 dark:text-white">교내 연계 사이트</h1>
                <p className="text-slate-500">학교 생활에 필요한 공식 사이트와 커뮤니티를 모았습니다.</p>
            </div>

            <div className="space-y-12">
                <Section title="학교/기관" icon={School} items={groupedSites.OFFICIAL} />
                <Section title="동아리/학생활동" icon={Users} items={groupedSites.CLUB} />
                <Section title="커뮤니티/기타" icon={Building2} items={[...groupedSites.COMMUNITY, ...groupedSites.OTHER]} />

                {sites.length === 0 && (
                    <div className="text-center py-20 text-slate-500 glass rounded-3xl">
                        등록된 사이트가 없습니다.
                    </div>
                )}
            </div>
        </div>
    );
}
