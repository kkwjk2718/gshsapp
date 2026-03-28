import Link from "next/link";
import { ArrowLeft, Calendar, Megaphone, ShieldCheck, User } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/db";
import { formatKST } from "@/lib/date-utils";
import { canManageNotice } from "@/lib/notice-permissions";
import { getCurrentUser } from "@/lib/session";
import { NoticeDeleteForm } from "@/components/notice-delete-form";

type Props = {
  params: Promise<{ id: string }>;
};

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const notice = await prisma.notice.findUnique({
    where: { id },
    include: { writer: true },
  });

  if (!notice) {
    return {
      title: "공지사항을 찾을 수 없습니다",
    };
  }

  const ogImage = `/notices/${id}/opengraph-image`;

  return {
    title: `${notice.title} | 공지사항`,
    description: notice.content.substring(0, 160),
    alternates: { canonical: `/notices/${id}` },
    openGraph: {
      title: notice.title,
      description: notice.content.substring(0, 160),
      type: "article",
      url: `/notices/${id}`,
      images: [{ url: ogImage, width: 1200, height: 630, alt: notice.title }],
    },
    twitter: {
      card: "summary_large_image",
      title: notice.title,
      description: notice.content.substring(0, 160),
      images: [ogImage],
    },
  };
}

export default async function NoticeDetailPage({ params }: Props) {
  const { id } = await params;
  const [notice, currentUser] = await Promise.all([
    prisma.notice.findUnique({
      where: { id },
      include: { writer: true },
    }),
    getCurrentUser(),
  ]);

  if (!notice) {
    notFound();
  }

  const isAdmin = notice.writer.role === "ADMIN";
  const canManage = canManageNotice(currentUser, notice.writerId);

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-4xl mx-auto">
        <Link
          href="/notices"
          className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-6"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="font-medium">목록으로</span>
        </Link>

        <div
          className={`glass p-8 rounded-3xl border-l-4 ${
            isAdmin ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10" : "border-transparent"
          }`}
        >
          <div className="flex items-center gap-2 mb-4">
            <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600">
              <Megaphone className="w-5 h-5" />
            </div>
            <span
              className={`px-3 py-1 rounded-lg text-sm font-bold ${
                isAdmin
                  ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300"
                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
              }`}
            >
              {notice.category}
            </span>
            {isAdmin && (
              <div className="flex items-center gap-1 px-2 py-1 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">관리자</span>
              </div>
            )}
          </div>

          <h1 className="text-3xl md:text-4xl font-bold mb-6 text-slate-900 dark:text-slate-100">
            {notice.title}
          </h1>

          <div className="flex flex-wrap items-center gap-4 mb-6 pb-6 border-b border-slate-200 dark:border-slate-800">
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <User className="w-4 h-4" />
              <span className="text-sm">
                {notice.writer.name} {isAdmin ? "(관리자)" : ""}
              </span>
            </div>
            <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
              <Calendar className="w-4 h-4" />
              <span className="text-sm">{formatKST(notice.createdAt, "yyyy년 MM월 dd일")}</span>
            </div>
            {!notice.expiresAt && (
              <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1 rounded-full font-medium">
                상시 공지
              </span>
            )}
          </div>

          <div className="prose prose-slate dark:prose-invert max-w-none">
            <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed text-base">
              {notice.content}
            </p>
          </div>
        </div>

        {canManage && (
          <div className="mt-6 flex justify-end gap-3">
            <Link
              href={`/admin/notices/${notice.id}/edit`}
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-indigo-700"
            >
              공지 수정
            </Link>
            <NoticeDeleteForm
              noticeId={notice.id}
              redirectTo="/notices"
              confirmMessage={`'${notice.title}' 공지를 삭제하시겠습니까?`}
              buttonClassName="inline-flex items-center gap-2 rounded-xl bg-rose-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-rose-700"
            >
              공지 삭제
            </NoticeDeleteForm>
          </div>
        )}
      </div>
    </div>
  );
}
