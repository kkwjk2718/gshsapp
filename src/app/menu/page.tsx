import Link from "next/link";
import { User, Settings, BookOpen, Music, Utensils, Clock, Calendar } from "lucide-react";

export default function MenuPage() {
  const menuItems = [
    { name: "내 정보", href: "/me", icon: User, color: "text-indigo-600", bg: "bg-indigo-100" },
    { name: "급식", href: "/meals", icon: Utensils, color: "text-orange-600", bg: "bg-orange-100" },
    { name: "시간표", href: "/timetable", icon: Clock, color: "text-emerald-600", bg: "bg-emerald-100" },
    { name: "기상곡", href: "/songs", icon: Music, color: "text-rose-600", bg: "bg-rose-100" },
    { name: "학사일정", href: "/calendar", icon: Calendar, color: "text-blue-600", bg: "bg-blue-100" }, // Placeholder
  ];

  return (
    <div className="p-4 space-y-6 pb-24">
      <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">전체 메뉴</h1>
      
      <div className="grid grid-cols-2 gap-4">
         {menuItems.map((item) => (
           <Link href={item.href} key={item.name} className="glass p-4 rounded-2xl flex flex-col items-center justify-center gap-3 aspect-square hover:scale-[1.02] transition-transform">
              <div className={`p-3 rounded-full ${item.bg} dark:bg-opacity-20 ${item.color}`}>
                 <item.icon className="w-6 h-6" />
              </div>
              <span className="font-medium">{item.name}</span>
           </Link>
         ))}
      </div>

      <div className="glass p-4 rounded-2xl">
         <h2 className="font-semibold mb-2">시스템 정보</h2>
         <p className="text-xs text-slate-500">
            GSHS.app v1.0.0<br/>
            Developed by GSHS Students
         </p>
      </div>
    </div>
  )
}
