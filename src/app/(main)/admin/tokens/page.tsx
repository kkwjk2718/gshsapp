import { prisma } from "@/lib/db";
import { createTokens } from "./actions";
import { format } from "date-fns";
import { Users, Tag, FileText, ChevronRight } from "lucide-react";
import Link from "next/link";

export default async function TokenManagerPage() {
  const batches = await prisma.tokenBatch.findMany({
    orderBy: { createdAt: "desc" },
    include: { 
        _count: {
            select: { tokens: true }
        }
    }
  });

  return (
    <div className="p-8 space-y-8">
       <h1 className="text-2xl font-bold">초대 토큰 관리</h1>

       <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Create Form */}
          <div className="glass p-6 rounded-3xl h-fit lg:col-span-1">
             <h2 className="text-lg font-bold mb-4">토큰 일괄 발급</h2>
             <form action={createTokens} className="space-y-4">
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">발급명 (제목)</label>
                    <input name="title" placeholder="예: 2025 신입생 토큰" required className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">메모 (선택)</label>
                    <input name="memo" placeholder="상세 내용" className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                </div>
                <div className="grid grid-cols-2 gap-4">
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">역할</label>
                        <select name="targetRole" className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700">
                            <option value="STUDENT">학생</option>
                            <option value="TEACHER">선생님</option>
                            <option value="BROADCAST">방송부</option>
                            <option value="ADMIN">관리자</option>
                        </select>
                    </div>
                    <div>
                        <label className="text-xs font-bold text-slate-500 mb-1 block">기수 (학생만)</label>
                        <input name="targetGisu" type="number" placeholder="예: 42" className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                    </div>
                </div>
                <div>
                    <label className="text-xs font-bold text-slate-500 mb-1 block">발급 개수</label>
                    <input name="count" type="number" defaultValue={10} min={1} max={100} required className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                </div>
                <button className="w-full py-3 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors">
                    발급하기
                </button>
             </form>
          </div>

          {/* Batches List */}
          <div className="glass rounded-3xl overflow-hidden lg:col-span-2">
              <div className="p-6 border-b border-slate-200 dark:border-slate-800 flex justify-between items-center">
                  <h2 className="text-lg font-bold">발급 이력 (폴더)</h2>
              </div>
              <div className="divide-y divide-slate-200 dark:divide-slate-800">
                  {batches.map(batch => (
                      <Link key={batch.id} href={`/admin/tokens/${batch.id}`} className="flex items-center justify-between p-6 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors group">
                          <div className="flex items-start gap-4">
                              <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-2xl text-indigo-600">
                                  <FileText className="w-6 h-6" />
                              </div>
                              <div>
                                  <div className="font-bold text-lg mb-1">{batch.title}</div>
                                  <div className="text-sm text-slate-500 line-clamp-1">{batch.memo || "메모 없음"}</div>
                                  <div className="flex items-center gap-3 mt-2 text-xs text-slate-400">
                                      <span>{format(batch.createdAt, "yyyy.MM.dd HH:mm")}</span>
                                      <span>&middot;</span>
                                      <span>{batch._count.tokens}개 토큰</span>
                                  </div>
                              </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-slate-300 group-hover:text-indigo-500 transition-colors" />
                      </Link>
                  ))}
                  {batches.length === 0 && (
                      <div className="p-12 text-center text-slate-500">
                          발급 이력이 없습니다.
                      </div>
                  )}
              </div>
          </div>
       </div>
    </div>
  )
}
