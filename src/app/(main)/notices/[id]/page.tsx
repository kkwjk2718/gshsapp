import { prisma } from "@/lib/db";
import { format } from "date-fns";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Megaphone, ShieldCheck, Calendar, User } from "lucide-react";
import { Metadata } from "next";

type Props = {
    params: { id: string };
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

    return {
        title: `${notice.title} | 공지사항`,
        description: notice.content.substring(0, 160),
    };
}

export default async function NoticeDetailPage({ params }: Props) {
    const { id } = await params;
    const notice = await prisma.notice.findUnique({
        where: { id },
        include: { writer: true },
    });

    if (!notice) {
        notFound();
    }

    const isAdmin = notice.writer.role === 'ADMIN';

    return (
        <div className="p-4 md:p-8">
            <div className="max-w-4xl mx-auto">
                {/* Back Button */}
                <Link
                    href="/notices"
                    className="inline-flex items-center gap-2 text-slate-600 dark:text-slate-400 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors mb-6"
                >
                    <ArrowLeft className="w-4 h-4" />
                    <span className="font-medium">목록으로</span>
                </Link>

                {/* Notice Detail Card */}
                <div className={`glass p-8 rounded-3xl border-l-4 ${isAdmin ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10" : "border-transparent"}`}>
                    {/* Header */}
                    <div className="flex items-center gap-2 mb-4">
                        <div className="p-2 bg-indigo-100 dark:bg-indigo-900/30 rounded-lg text-indigo-600">
                            <Megaphone className="w-5 h-5" />
                        </div>
                        <span className={`px-3 py-1 rounded-lg text-sm font-bold ${isAdmin ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"}`}>
                            {notice.category}
                        </span>
                        {isAdmin && (
                            <div className="flex items-center gap-1 px-2 py-1 bg-indigo-100 dark:bg-indigo-900/50 rounded-lg">
                                <ShieldCheck className="w-4 h-4 text-indigo-600 dark:text-indigo-400" />
                                <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">관리자</span>
                            </div>
                        )}
                    </div>

                    {/* Title */}
                    <h1 className="text-3xl md:text-4xl font-bold mb-6 text-slate-900 dark:text-slate-100">
                        {notice.title}
                    </h1>

                    {/* Meta Information */}
                    <div className="flex flex-wrap items-center gap-4 mb-6 pb-6 border-b border-slate-200 dark:border-slate-800">
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                            <User className="w-4 h-4" />
                            <span className="text-sm">
                                {notice.writer.name} {isAdmin && "(관리자)"}
                            </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-400">
                            <Calendar className="w-4 h-4" />
                            <span className="text-sm">
                                {format(notice.createdAt, "yyyy년 MM월 dd일")}
                            </span>
                        </div>
                        {!notice.expiresAt && (
                            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-400 px-3 py-1 rounded-full font-medium">
                                상시 공지
                            </span>
                        )}
                    </div>

                    {/* Content */}
                    <div className="prose prose-slate dark:prose-invert max-w-none">
                        <p className="text-slate-700 dark:text-slate-300 whitespace-pre-wrap leading-relaxed text-base">
                            {notice.content}
                        </p>
                    </div>
                </div>

                {/* Back Button (Bottom) */}
                <div className="mt-6 text-center">
                    <Link
                        href="/notices"
                        className="inline-flex items-center gap-2 px-6 py-3 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 font-medium rounded-xl transition-colors"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        목록으로 돌아가기
                    </Link>
                </div>
            </div>
        </div>
    );
}
