import Link from "next/link";
import { getCurrentUser } from "@/lib/session";
import { SidebarNav } from "./SidebarNav";
import { LogOut, ShieldCheck, Radio } from "lucide-react";
import { signOut } from "@/auth";
import { ModeToggle } from "@/components/mode-toggle";


export async function Sidebar() {
  const user = await getCurrentUser();

  return (
    <aside className="hidden md:flex flex-col w-64 fixed left-0 top-0 h-full border-r border-slate-200 dark:border-white/5 bg-white dark:bg-slate-900/50 backdrop-blur-xl z-50">
      {/* Header */}
      <div className="p-6 flex-shrink-0">
        <Link href="/" className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">GSHS.app</Link>
      </div>

      {/* Navigation Area */}
      <div className="flex-1 flex flex-col gap-1 px-4">
        <SidebarNav />

        {(user?.role === "BROADCAST" || user?.role === "ADMIN") && (
          <Link href="/music" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-rose-400 hover:bg-rose-900/20 transition-colors">
            <Radio className="w-5 h-5" />
            <span className="font-semibold text-sm">방송부 스튜디오</span>
          </Link>
        )}

        {user?.role === "ADMIN" && (
          <Link href="/admin" className="flex items-center gap-3 px-4 py-2.5 rounded-xl text-indigo-400 hover:bg-indigo-900/20 transition-colors">
            <ShieldCheck className="w-5 h-5" />
            <span className="font-semibold text-sm">관리자 페이지</span>
          </Link>
        )}
      </div>

      {/* Bottom User Area (Pushed to bottom) */}
      <div className="p-4 border-t border-slate-200 dark:border-slate-800 mt-auto flex-shrink-0">
        {user ? (
          <div className="flex flex-col gap-2">
            <Link href="/me" className="flex items-center gap-3 px-4 py-3 rounded-xl bg-slate-100 dark:bg-slate-800/50 hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors">
              <div className="w-8 h-8 rounded-full bg-indigo-100 dark:bg-indigo-900 flex items-center justify-center text-indigo-600 dark:text-indigo-400 font-bold text-xs">
                {user.name?.[0] || "U"}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{user.name}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400 truncate">{user.studentId || user.email}</div>
              </div>
            </Link>
            <form
              action={async () => {
                "use server";
                await signOut();
              }}
            >
              <button className="w-full flex items-center gap-3 px-4 py-2 text-xs text-rose-500 hover:bg-rose-900/20 rounded-lg transition-colors">
                <LogOut className="w-3 h-3" />
                로그아웃
              </button>
            </form>
          </div>
        ) : (
          <Link href="/login" className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white transition-colors font-medium">
            로그인
          </Link>
        )}

        {/* Theme Toggle - Always visible */}
        <div className="flex items-center justify-center pt-4">
          <ModeToggle />
        </div>
      </div>
    </aside>
  );
}