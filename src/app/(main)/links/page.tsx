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
    <div className="mobile-page mobile-safe-bottom space-y-8">
       <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
             <div className="p-3 rounded-full" style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}>
                <LinkIcon className="w-6 h-6" />
             </div>
             <div>
                <h1 className="text-2xl font-bold">바로가기 모음</h1>
                <p style={{ color: "var(--muted)" }}>유용한 사이트 링크를 모아두었습니다.</p>
             </div>
          </div>
       </div>

       <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {links.map((link) => (
             <LinkCard key={link.id} link={link} canEdit={canEdit} />
          ))}
          
          {links.length === 0 && (
              <div className="col-span-full py-12 text-center glass rounded-3xl" style={{ color: "var(--muted)" }}>
                  등록된 링크가 없습니다.
              </div>
          )}
       </div>

       {canEdit && (
          <div className="glass p-6 rounded-3xl border-t-4 mt-8" style={{ borderColor: "var(--accent)" }}>
             <h3 className="font-bold text-lg mb-4 flex items-center gap-2">
                <Plus className="w-5 h-5" />
                새 링크 추가 (관리자/선생님 전용)
             </h3>
             <form action={createLink} className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <input name="title" placeholder="사이트 이름" required className="px-4 py-3 rounded-xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                <input name="url" placeholder="URL (https://...)" required className="px-4 py-3 rounded-xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                {/* Hidden category input with default value */}
                <input type="hidden" name="category" value="GENERAL" />
                <input name="description" placeholder="간단한 설명" className="md:col-span-2 px-4 py-3 rounded-xl border" style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }} />
                <button className="md:col-span-2 py-3 font-bold rounded-xl transition-colors" style={{ backgroundColor: "var(--accent)", color: "var(--brand-sub)" }}>
                   추가하기
                </button>
             </form>
          </div>
       )}
    </div>
  )
}