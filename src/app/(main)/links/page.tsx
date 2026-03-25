import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { Link as LinkIcon, Plus } from "lucide-react";
import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { LinkCard } from "./link-card";
import { createLink } from "./actions";
import { canAccessCoreMemberFeatures, canEditLinks } from "@/lib/user-roles";

export const metadata: Metadata = {
  title: "링크모음",
  description: "학교 생활에 유용한 웹사이트 링크모음입니다.",
};

export default async function LinksPage() {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  if (!canAccessCoreMemberFeatures(user.role)) redirect("/");

  const canEdit = canEditLinks(user.role);
  const links = await prisma.linkItem.findMany({
    orderBy: { createdAt: "desc" },
  });

  return (
    <div className="mobile-page mobile-safe-bottom space-y-8">
      <div className="mb-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div
            className="rounded-full p-3"
            style={{ backgroundColor: "var(--surface-2)", color: "var(--accent)" }}
          >
            <LinkIcon className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold">링크모음</h1>
            <p style={{ color: "var(--muted)" }}>학교 생활에 유용한 사이트를 모아두었습니다.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
        {links.map((link) => (
          <LinkCard key={link.id} link={link} canEdit={canEdit} />
        ))}

        {links.length === 0 ? (
          <div className="glass col-span-full rounded-3xl py-12 text-center" style={{ color: "var(--muted)" }}>
            등록된 링크가 없습니다.
          </div>
        ) : null}
      </div>

      {canEdit ? (
        <div className="glass mt-8 rounded-3xl border-t-4 p-6" style={{ borderColor: "var(--accent)" }}>
          <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
            <Plus className="h-5 w-5" />
            링크 추가 (관리자/교사용)
          </h3>
          <form action={createLink} className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <input
              name="title"
              placeholder="사이트 이름"
              required
              className="rounded-xl border px-4 py-3"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
            <input
              name="url"
              placeholder="URL (https://...)"
              required
              className="rounded-xl border px-4 py-3"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
            <input type="hidden" name="category" value="GENERAL" />
            <input
              name="description"
              placeholder="간단한 설명"
              className="rounded-xl border px-4 py-3 md:col-span-2"
              style={{
                backgroundColor: "var(--surface)",
                borderColor: "var(--border)",
                color: "var(--foreground)",
              }}
            />
            <button
              className="rounded-xl py-3 font-bold transition-colors md:col-span-2"
              style={{ backgroundColor: "var(--accent)", color: "var(--brand-sub)" }}
            >
              추가하기
            </button>
          </form>
        </div>
      ) : null}
    </div>
  );
}
