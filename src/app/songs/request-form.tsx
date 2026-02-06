"use client"

import { requestSong } from "./actions";
import { Search, Plus } from "lucide-react";
import { useRef } from "react";

export function SongRequestForm() {
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form 
      action={async (formData) => {
        await requestSong(formData);
        formRef.current?.reset();
      }} 
      ref={formRef}
      className="glass p-4 rounded-2xl flex flex-col gap-4 md:flex-row md:items-center"
    >
       <div className="flex-1 relative">
         <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
         <input 
           name="youtubeUrl"
           type="url" 
           placeholder="YouTube URL을 입력하세요..." 
           className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
           required
         />
       </div>
       <div className="flex-1 md:max-w-xs">
          <input 
            name="videoTitle"
            type="text" 
            placeholder="노래 제목 (선택)" 
            className="w-full px-4 py-2 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
       </div>
       <button 
         type="submit"
         className="flex items-center justify-center gap-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-medium transition-colors cursor-pointer"
       >
         <Plus className="w-4 h-4" />
         <span>신청하기</span>
       </button>
    </form>
  )
}
