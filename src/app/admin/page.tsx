import { prisma } from "@/lib/db";
import Link from "next/link";
import { Music, Users, Bell, ArrowRight, Ticket, Tag, Settings, ScrollText, Activity, Send } from "lucide-react";

export default async function AdminDashboard() {
   const pendingSongsCount = await prisma.songRequest.count({
      where: { status: "PENDING" },
   });

   const usersCount = await prisma.user.count();
   const noticesCount = await prisma.notice.count();
   // Count valid (unused) tokens
   const tokensCount = await prisma.inviteToken.count({
      where: { isUsed: false }
   });

   const StatCard = ({ title, value, icon: Icon, href, color }: any) => (
      <Link href={href} className="glass p-6 rounded-3xl flex items-center justify-between hover:scale-[1.02] transition-transform">
         <div>
            <div className="text-slate-400 mb-1">{title}</div>
            <div className="text-3xl font-bold text-slate-100">{value}</div>
         </div>
         <div className={`p-4 rounded-full ${color}`}>
            <Icon className="w-6 h-6 text-white" />
         </div>
      </Link>
   );

   return (
      <div className="p-8 space-y-8">
         <h1 className="text-3xl font-bold text-slate-100">관리자 대시보드</h1>

         <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <StatCard
               title="기상곡 승인 대기"
               value={pendingSongsCount}
               icon={Music}
               href="/admin/songs"
               color="bg-rose-500"
            />
            <StatCard
               title="전체 사용자"
               value={usersCount}
               icon={Users}
               href="/admin/users"
               color="bg-indigo-500"
            />
            <StatCard
               title="게시된 공지"
               value={noticesCount}
               icon={Bell}
               href="/admin/notices"
               color="bg-emerald-500"
            />
            <StatCard
               title="사용 가능 토큰"
               value={tokensCount}
               icon={Ticket}
               href="/admin/tokens"
               color="bg-amber-500"
            />
         </div>

         <div className="glass p-8 rounded-3xl">
            <h2 className="text-xl font-bold mb-4 text-slate-100">빠른 작업</h2>
            <div className="flex flex-wrap gap-4">
               <Link href="/admin/notices/new" className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-2 hover:bg-indigo-700 transition-colors">
                  새 공지 작성
                  <ArrowRight className="w-4 h-4" />
               </Link>
               <Link href="/admin/notifications" className="px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold flex items-center gap-2 hover:bg-indigo-700 transition-colors">
                  알림 발송
                  <Send className="w-4 h-4" />
               </Link>
               <Link href="/admin/tokens" className="px-6 py-3 rounded-xl bg-slate-800 text-slate-100 border border-slate-700 font-bold flex items-center gap-2 hover:bg-slate-700 transition-colors">
                  초대 토큰 발급
                  <Ticket className="w-4 h-4" />
               </Link>
               <Link href="/admin/categories" className="px-6 py-3 rounded-xl bg-slate-800 text-slate-100 border border-slate-700 font-bold flex items-center gap-2 hover:bg-slate-700 transition-colors">
                  공지 카테고리 관리
                  <Tag className="w-4 h-4" />
               </Link>
               <Link href="/admin/settings" className="px-6 py-3 rounded-xl bg-slate-800 text-slate-100 border border-slate-700 font-bold flex items-center gap-2 hover:bg-slate-700 transition-colors">
                  시스템 설정
                  <Settings className="w-4 h-4" />
               </Link>
               <Link href="/admin/logs" className="px-6 py-3 rounded-xl bg-slate-800 text-slate-100 border border-slate-700 font-bold flex items-center gap-2 hover:bg-slate-700 transition-colors">
                  시스템 로그 관리
                  <ScrollText className="w-4 h-4" />
               </Link>
               <Link href="/admin/reports" className="px-6 py-3 rounded-xl bg-rose-900/30 text-rose-400 border border-rose-700/50 font-bold flex items-center gap-2 hover:bg-rose-900/50 transition-colors">
                  오류 신고 관리
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
               </Link>
               <Link href="/admin/test" className="px-6 py-3 rounded-xl bg-slate-800 text-rose-400 border border-rose-900/50 font-bold flex items-center gap-2 hover:bg-rose-900/20 transition-colors">
                  시스템 기능 진단
                  <Activity className="w-4 h-4" />
               </Link>
            </div>
         </div>
      </div>
   );
}