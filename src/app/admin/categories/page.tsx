import { prisma } from "@/lib/db";
import { createCategory, deleteCategory } from "./actions";
import { Trash2, Tag } from "lucide-react";

export default async function CategoriesPage() {
  const categories = await prisma.noticeCategory.findMany();

  return (
    <div className="p-8 space-y-8">
      <h1 className="text-2xl font-bold">공지 카테고리 관리</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
         {/* List */}
         <div className="glass rounded-3xl overflow-hidden">
            <table className="w-full text-left">
                <thead className="bg-slate-50 dark:bg-slate-900/50 border-b border-slate-200 dark:border-slate-800">
                    <tr>
                        <th className="p-4">이름 (Label)</th>
                        <th className="p-4">코드 (Value)</th>
                        <th className="p-4 text-right">삭제</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-slate-800">
                    {categories.map(cat => (
                        <tr key={cat.id}>
                            <td className="p-4 font-bold">{cat.label}</td>
                            <td className="p-4 font-mono text-sm text-slate-500">{cat.value}</td>
                            <td className="p-4 text-right">
                                <form action={deleteCategory.bind(null, cat.id)}>
                                    <button className="text-rose-500 hover:bg-rose-50 p-2 rounded-lg transition-colors">
                                        <Trash2 className="w-4 h-4" />
                                    </button>
                                </form>
                            </td>
                        </tr>
                    ))}
                </tbody>
            </table>
         </div>

         {/* Create Form */}
         <div className="glass p-6 rounded-3xl h-fit">
             <h2 className="text-lg font-bold mb-4 flex items-center gap-2">
                 <Tag className="w-5 h-5" />
                 새 카테고리 추가
             </h2>
             <form action={createCategory} className="space-y-4">
                 <div>
                     <label className="text-xs font-bold text-slate-500 mb-1 block">카테고리 이름 (한글)</label>
                     <input name="label" placeholder="예: 학사, 동아리" required className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                 </div>
                 <div>
                     <label className="text-xs font-bold text-slate-500 mb-1 block">코드값 (영어, 자동 대문자)</label>
                     <input name="value" placeholder="예: CLUB" required className="w-full px-3 py-2 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700" />
                 </div>
                 <button className="w-full py-2 bg-indigo-600 text-white font-bold rounded-xl hover:bg-indigo-700 transition-colors">
                     추가하기
                 </button>
             </form>
         </div>
      </div>
    </div>
  );
}
