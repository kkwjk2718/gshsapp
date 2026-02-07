import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { createLink } from "./actions";
import { Link as LinkIcon, Plus } from "lucide-react";
import { LinkCard } from "./link-card";
import { redirect } from "next/navigation";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "바로가기",
  description: "학교 생활에 유용한 웹사이트 바로가기 모음입니다.",
};

export default async function LinksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const canEdit = user.role === 'TEACHER' || user.role === 'ADMIN';

  const links = await prisma.linkItem.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="p-4 md:p-8 space-y-8">
       <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
             <div className="p-3 bg-sky-100 dark:bg-sky-900/30 rounded-full text-sky-600">
                <LinkIcon className="w-6 h-6" />
             </div>
             <div>
                <h1 className="text-2xl font-bold">바로가기 모음</h1>
                <p className="text-slate-500">유용한 사이트 링크를 모아두었습니다.</p>
             </div>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {links.map((link) => (
             <LinkCard key={link.id} link={link} canEdit={canEdit} />
          ))}
          
          {links.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                  등록된 링크가 없습니다.
              </div>
          )}
       </div>

       {canEdit && (
          <div className="glass p-6 rounded-3xl border-t-4 border-indigo-500 mt-8">
             <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5" />
                새 링크 추가 (관리자/선생님 전용)
             </h3>
             <form action={createLink} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input name="title" placeholder="사이트 이름" required className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                <input name="url" placeholder="URL (https://...)" required className="px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                {/* Hidden category input with default value */}
                <input type="hidden" name="category" value="GENERAL" />
                <input name="description" placeholder="간단한 설명" className="md:col-span-2 px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                <button className="md:col-span-2 py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors">
                   추가하기
                </button>
             </form>
          </div>
       )}
    </div>
  )
}