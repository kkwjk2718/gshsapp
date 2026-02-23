import { prisma } from "@/lib/db";
import { format } from "date-fns";
import Link from "next/link";
import { Megaphone, ShieldCheck, PlusCircle } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { Metadata } from "next";

export const metadata: Metadata = {
   title: "공지사항",
   description: "학교의 주요 공지사항과 소식을 확인하세요.",
};

export default async function NoticesPage() {
   const user = await getCurrentUser();

   const notices = await prisma.notice.findMany({
      orderBy: { createdAt: "desc" },
      where: {
         OR: [
            { expiresAt: { gt: new Date() } },
            { expiresAt: null }
         ]
      },
      include: { writer: true },
   });

   const canWrite = user?.role === 'ADMIN' || user?.role === 'TEACHER';

   return (
      <div className="mobile-page mobile-safe-bottom space-y-6">
         <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-6">
            <div className="flex items-center gap-3">
               <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-full text-indigo-600">
                  <Megaphone className="w-6 h-6" />
               </div>
               <div>
                  <h1 className="text-2xl font-bold">공지사항</h1>
                  <p className="text-slate-500">학교의 주요 소식을 확인하세요.</p>
               </div>
            </div>

            {canWrite && (
               <Link
                  href="/admin/notices/new"
                  className="flex items-center justify-center gap-2 px-4 py-2.5 tap-target bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors w-full sm:w-auto"
               >
                  <PlusCircle className="w-4 h-4" />
                  새 공지 작성
               </Link>
            )}
         </div>

         <div className="space-y-4">
            {notices.map((notice) => {
               const isAdmin = notice.writer.role === 'ADMIN';
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
                        className={`glass p-6 rounded-3xl hover:scale-[1.01] transition-all border-l-4 cursor-pointer ${isAdmin ? "border-indigo-500 bg-indigo-50/50 dark:bg-indigo-900/10" : "border-transparent"}`}
                     >
                        <div className="flex items-center gap-2 mb-2">
                           <span className={`px-2 py-1 rounded-md text-xs font-bold ${isAdmin ? "bg-indigo-100 text-indigo-600 dark:bg-indigo-900 dark:text-indigo-300" : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"}`}>
                              {notice.category}
                           </span>
                           {isAdmin && <ShieldCheck className="w-4 h-4 text-indigo-500" />}
                           <span className="text-xs text-slate-400">
                              {format(notice.createdAt, "yyyy.MM.dd")}
                           </span>
                        </div>
                        <h2 className="text-xl font-bold mb-2">{notice.title}</h2>
                        <p className="text-slate-600 dark:text-slate-300 leading-relaxed mb-2">
                           {truncatedContent}
                        </p>
                        {showMoreLink && (
                           <span className="text-sm font-medium text-indigo-600 dark:text-indigo-400 hover:underline">
                              더 보기 →
                           </span>
                        )}
                        <div className="mt-4 pt-4 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-sm text-slate-500">
                           <span>작성자: {notice.writer.name} {isAdmin ? "(관리자)" : ""}</span>
                           {!notice.expiresAt && <span className="text-xs bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">상시 공지</span>}
                        </div>
                     </div>
                  </Link>
               )
            })}

            {notices.length === 0 && (
               <div className="py-12 text-center text-slate-500">
                  등록된 공지사항이 없습니다.
               </div>
            )}
         </div>
      </div>
   )
}
