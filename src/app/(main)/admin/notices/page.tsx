import { prisma } from "@/lib/db";
import { deleteNotice } from "./actions";
import Link from "next/link";
import { Plus, Trash2, Pencil } from "lucide-react";
import { formatKST } from "@/lib/date-utils";

export default async function AdminNoticesPage() {
  const notices = await prisma.notice.findMany({
    orderBy: { createdAt: "desc" },
    include: { writer: true },
  });

  return (
    <div className="p-8 space-y-8">
       <div className="flex items-center justify-between">
         <h1 className="text-2xl font-bold">공지사항 관리</h1>
         <Link href="/admin/notices/new" className="px-4 py-2 bg-indigo-600 text-white rounded-xl font-bold flex items-center gap-2 hover:bg-indigo-700 transition-colors">
            <Plus className="w-4 h-4" />
            새 공지
         </Link>
       </div>

       <div className="glass rounded-3xl overflow-hidden">
          <table className="w-full text-left">
             <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                <tr>
                   <th className="p-4 font-medium text-slate-500">제목</th>
                   <th className="p-4 font-medium text-slate-500">카테고리</th>
                   <th className="p-4 font-medium text-slate-500">작성자</th>
                   <th className="p-4 font-medium text-slate-500">작성일</th>
                   <th className="p-4 font-medium text-slate-500 text-right">관리</th>
                </tr>
             </thead>
             <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                {notices.map((notice) => (
                   <tr key={notice.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                      <td className="p-4 font-medium">{notice.title}</td>
                      <td className="p-4 text-sm text-slate-500">{notice.category}</td>
                      <td className="p-4 text-sm text-slate-500">{notice.writer.name}</td>
                      <td className="p-4 text-sm text-slate-500">{formatKST(notice.createdAt, "yyyy.MM.dd")}</td>
                      <td className="p-4 text-right">
                         <div className="flex items-center justify-end gap-1">
                            <Link href={`/admin/notices/${notice.id}/edit`} className="text-indigo-500 hover:text-indigo-600 transition-colors p-2 hover:bg-indigo-50 rounded-lg">
                               <Pencil className="w-4 h-4" />
                            </Link>
                            <form action={deleteNotice}>
                               <input type="hidden" name="id" value={notice.id} />
                               <button
                                  aria-label={`${notice.title} 삭제`}
                                  className="text-rose-500 hover:text-rose-600 transition-colors p-2 hover:bg-rose-50 rounded-lg"
                               >
                                  <Trash2 className="w-4 h-4" />
                               </button>
                            </form>
                         </div>
                      </td>
                   </tr>
                ))}
             </tbody>
          </table>
          {notices.length === 0 && (
              <div className="p-12 text-center text-slate-500">등록된 공지사항이 없습니다.</div>
          )}
       </div>
    </div>
  )
}
