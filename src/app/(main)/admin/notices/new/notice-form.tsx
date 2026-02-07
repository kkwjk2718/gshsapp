"use client"

import { createNotice } from "../actions";
import { ArrowLeft, Calendar } from "lucide-react";
import Link from "next/link";
import { useState } from "react";

interface Category {
  id: string;
  label: string;
  value: string;
}

export function NoticeForm({ categories }: { categories: Category[] }) {
  const [isUnlimited, setIsUnlimited] = useState(false);
  const [contentLength, setContentLength] = useState(0);
  const MAX_LENGTH = 1000;

  return (
    <div className="p-8 max-w-2xl mx-auto space-y-8">
       <div className="flex items-center gap-4">
          <Link href="/admin/notices" className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
             <ArrowLeft className="w-5 h-5" />
          </Link>
          <h1 className="text-2xl font-bold">새 공지 작성</h1>
       </div>

       <form action={createNotice} className="glass p-8 rounded-3xl space-y-6">
          <div className="space-y-2">
             <label className="font-semibold text-sm">제목</label>
             <input 
               name="title"
               type="text" 
               placeholder="공지 제목을 입력하세요"
               required
               className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
             />
          </div>
          
          <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                 <label className="font-semibold text-sm">카테고리</label>
                 <select 
                   name="category"
                   className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                 >
                    {categories.map(cat => (
                        <option key={cat.id} value={cat.value}>{cat.label}</option>
                    ))}
                 </select>
              </div>

              <div className="space-y-2">
                 <label className="font-semibold text-sm flex justify-between">
                    게시 기간
                    <div className="flex items-center gap-2">
                        <input 
                            type="checkbox" 
                            name="unlimited" 
                            id="unlimited" 
                            checked={isUnlimited}
                            onChange={(e) => setIsUnlimited(e.target.checked)}
                            className="w-4 h-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                        />
                        <label htmlFor="unlimited" className="text-xs font-normal text-slate-500 cursor-pointer">무제한 (관리자용)</label>
                    </div>
                 </label>
                 <div className="relative">
                    <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
                    <select 
                       name="duration"
                       disabled={isUnlimited}
                       className="w-full pl-10 pr-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-50"
                    >
                       {Array.from({ length: 14 }, (_, i) => i + 1).map(day => (
                           <option key={day} value={day}>{day}일</option>
                       ))}
                    </select>
                 </div>
              </div>
          </div>

          <div className="space-y-2">
             <div className="flex justify-between items-center">
                 <label className="font-semibold text-sm">내용</label>
                 <span className={`text-xs ${contentLength >= MAX_LENGTH ? "text-rose-500 font-bold" : "text-slate-400"}`}>
                     {contentLength} / {MAX_LENGTH}자
                 </span>
             </div>
             <textarea 
               name="content"
               rows={10}
               maxLength={MAX_LENGTH}
               placeholder="공지 내용을 입력하세요 (최대 1000자)"
               required
               onChange={(e) => setContentLength(e.target.value.length)}
               className="w-full px-4 py-3 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
             />
          </div>

          <div className="pt-4">
             <button type="submit" className="w-full py-3 bg-indigo-600 hover:bg-indigo-700 text-white font-bold rounded-xl transition-colors">
                작성 완료
             </button>
          </div>
       </form>
    </div>
  )
}