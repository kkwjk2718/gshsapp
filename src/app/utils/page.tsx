"use client"

import Link from "next/link";
import { Calculator, ArrowRight, Wrench } from "lucide-react";

const tools = [
   {
      name: "생기부 바이트 계산기",
      description: "나이스(NEIS) 기준 생기부 입력용 바이트 수를 계산합니다.",
      icon: Calculator,
      href: "/utils/byte-calculator",
      color: "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400",
   },
   // Add more tools here in the future
];

export default function UtilsPage() {
   return (
      <div className="p-4 md:p-8 space-y-8">
         <div className="flex items-center gap-3">
            <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-full text-indigo-600">
               <Wrench className="w-6 h-6" />
            </div>
            <div>
               <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">도구 모음</h1>
               <p className="text-slate-500 dark:text-slate-400">학교 생활에 유용한 도구들을 모았습니다.</p>
            </div>
         </div>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {tools.map((tool) => (
               <Link
                  key={tool.href}
                  href={tool.href}
                  className="group glass p-6 rounded-3xl border border-transparent hover:border-indigo-500/30 transition-all duration-300 hover:shadow-lg hover:-translate-y-1 block"
               >
                  <div className="flex items-start justify-between mb-4">
                     <div className={`p-3 rounded-2xl ${tool.color}`}>
                        <tool.icon className="w-6 h-6" />
                     </div>
                     <div className="p-2 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 group-hover:text-indigo-500 group-hover:bg-indigo-50 dark:group-hover:bg-indigo-900/30 transition-colors">
                        <ArrowRight className="w-4 h-4" />
                     </div>
                  </div>

                  <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100 mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                     {tool.name}
                  </h3>
                  <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                     {tool.description}
                  </p>
               </Link>
            ))}
         </div>
      </div>
   );
}
