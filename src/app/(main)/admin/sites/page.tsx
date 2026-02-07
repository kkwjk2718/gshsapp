import { prisma } from "@/lib/db";
import { createRelatedSite, deleteRelatedSite } from "./actions";
import { Trash2, ExternalLink, Plus } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { redirect } from "next/navigation";

export default async function AdminSitesPage() {
    const user = await getCurrentUser();
    if (!user || user.role !== 'ADMIN') redirect("/");

    const sites = await prisma.relatedSite.findMany({
        orderBy: { createdAt: "desc" },
    });

    return (
        <div className="space-y-8">
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-white">교내 사이트 관리</h1>
                <p className="text-slate-500">교내 연계 사이트 목록을 관리합니다.</p>
            </div>

            {/* Create Form */}
            <div className="glass p-6 rounded-3xl border-t-4 border-indigo-500">
                <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                    <Plus className="w-5 h-5" />
                    새 사이트 추가
                </h3>
                <form action={createRelatedSite} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <input name="name" placeholder="사이트 이름 (예: 학교 홈페이지)" required className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                    <input name="url" placeholder="URL (예: gshs.kr)" required className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />

                    <select name="category" className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                        <option value="OFFICIAL">학교/기관 (OFFICIAL)</option>
                        <option value="CLUB">동아리 (CLUB)</option>
                        <option value="COMMUNITY">커뮤니티 (COMMUNITY)</option>
                    </select>

                    <input name="description" placeholder="설명 (선택사항)" className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />

                    <button className="md:col-span-2 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors shadow-lg shadow-indigo-500/20">
                        추가하기
                    </button>
                </form>
            </div>

            {/* List */}
            <div className="glass rounded-3xl overflow-hidden">
                <table className="w-full text-sm text-left">
                    <thead className="bg-slate-50 dark:bg-slate-800/50 text-slate-500 font-medium">
                        <tr>
                            <th className="px-6 py-4">이름</th>
                            <th className="px-6 py-4">URL</th>
                            <th className="px-6 py-4">카테고리</th>
                            <th className="px-6 py-4">관리</th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                        {sites.map((site) => (
                            <tr key={site.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20 transition-colors">
                                <td className="px-6 py-4 font-medium">
                                    <div>{site.name}</div>
                                    <div className="text-xs text-slate-400">{site.description}</div>
                                </td>
                                <td className="px-6 py-4 text-blue-500 underline truncate max-w-[200px]">
                                    <a href={site.url} target="_blank" rel="noreferrer">{site.url}</a>
                                </td>
                                <td className="px-6 py-4">
                                    <span className="px-2 py-1 bg-slate-100 dark:bg-slate-800 rounded text-xs">
                                        {site.category}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <form action={deleteRelatedSite}>
                                        <input type="hidden" name="id" value={site.id} />
                                        <button className="p-2 text-rose-500 hover:bg-rose-50 dark:hover:bg-rose-900/20 rounded-lg transition-colors">
                                            <Trash2 className="w-4 h-4" />
                                        </button>
                                    </form>
                                </td>
                            </tr>
                        ))}
                        {sites.length === 0 && (
                            <tr>
                                <td colSpan={4} className="px-6 py-12 text-center text-slate-400">
                                    등록된 사이트가 없습니다.
                                </td>
                            </tr>
                        )}
                    </tbody>
                </table>
            </div>
        </div>
    );
}
