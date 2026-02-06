"use client"

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Megaphone, ArrowRight } from "lucide-react";
import Link from "next/link";

interface Notice {
  id: string;
  title: string;
  content: string;
}

export function NoticeRollingBanner({ notices }: { notices: Notice[] }) {
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (notices.length <= 1) return;

    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % notices.length);
    }, 5000); // 5 seconds per slide

    return () => clearInterval(interval);
  }, [notices.length]);

  if (notices.length === 0) {
      return (
        <div className="relative z-10 w-full h-full flex flex-col justify-center">
            <h3 className="text-sm font-bold mb-1 flex items-center gap-2 text-slate-500">
                <Megaphone className="w-4 h-4" />
                공지사항
            </h3>
            <p className="text-slate-400 text-xs">등록된 공지가 없습니다.</p>
        </div>
      )
  }

  return (
    <div className="relative z-10 w-full h-full flex flex-col">
       <div className="flex items-center justify-between mb-2">
           <h3 className="text-sm font-bold flex items-center gap-2 text-indigo-600 dark:text-indigo-400">
                <Megaphone className="w-4 h-4" />
                공지사항
           </h3>
           <Link href="/notices" className="text-[10px] text-slate-400 hover:text-indigo-500 flex items-center gap-0.5">
               전체보기 <ArrowRight className="w-3 h-3" />
           </Link>
       </div>
       
       <div className="flex-1 relative overflow-hidden min-h-[60px]">
         <AnimatePresence mode="wait">
            <motion.div
                key={notices[index].id}
                initial={{ y: 10, opacity: 0 }}
                animate={{ y: 0, opacity: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ duration: 0.3 }}
                className="absolute w-full"
            >
                <Link href="/notices" className="block group">
                    <div className="text-sm font-bold text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 transition-colors">
                        {notices[index].title}
                    </div>
                    <div className="text-xs text-slate-500 dark:text-slate-400 line-clamp-2 mt-1 leading-relaxed h-[32px]">
                        {notices[index].content}
                    </div>
                </Link>
            </motion.div>
         </AnimatePresence>
       </div>
       
       {/* Indicators */}
       {notices.length > 1 && (
           <div className="flex gap-1 mt-2">
               {notices.map((_, i) => (
                   <div 
                    key={i} 
                    className={`h-1 rounded-full transition-all duration-300 ${i === index ? "w-4 bg-indigo-500" : "w-1 bg-slate-200 dark:bg-slate-700"}`} 
                   />
               ))}
           </div>
       )}
    </div>
  )
}