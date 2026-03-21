"use client";

import Link from "next/link";
import { Radio, ShieldCheck } from "lucide-react";
import { SidebarNav } from "./SidebarNav";
import { ModeToggle } from "@/components/mode-toggle";
import { LogoutButton } from "@/components/auth/logout-button";
import { useUserSummary } from "@/components/user-summary-provider";

function UserCardSkeleton() {
  return (
    <div className="flex flex-col gap-2">
      <div className="flex items-center gap-3 px-4 py-3 rounded-xl" style={{ backgroundColor: "var(--surface-2)" }}>
        <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
        <div className="flex-1 space-y-2">
          <div className="h-3 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
          <div className="h-3 w-2/3 rounded bg-slate-200 dark:bg-slate-700 animate-pulse" />
        </div>
      </div>
    </div>
  );
}

export function Sidebar() {
  const { summary, isLoaded } = useUserSummary();
  const showMusicLink = summary.role === "BROADCAST" || summary.role === "ADMIN";
  const showAdminLink = summary.role === "ADMIN";

  return (
    <aside
      className="hidden md:flex flex-col w-64 fixed left-0 top-0 h-full border-r backdrop-blur-xl z-50"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <div className="p-6 flex-shrink-0">
        <Link href="/" className="text-2xl font-bold text-[color:var(--foreground)]">GSHS.app</Link>
      </div>

      <div className="flex-1 flex flex-col gap-1 px-4">
        <SidebarNav />

        {showMusicLink && (
          <Link
            href="/music"
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors"
            style={{ color: "var(--foreground)", backgroundColor: "transparent" }}
          >
            <Radio className="w-5 h-5" />
            <span className="font-semibold text-sm">방송부 스튜디오</span>
          </Link>
        )}

        {showAdminLink && (
          <Link
            href="/admin"
            className="flex items-center gap-3 px-4 py-2.5 rounded-xl transition-colors"
            style={{ color: "var(--foreground)", backgroundColor: "transparent" }}
          >
            <ShieldCheck className="w-5 h-5" />
            <span className="font-semibold text-sm">관리자 페이지</span>
          </Link>
        )}
      </div>

      <div className="p-4 border-t mt-auto flex-shrink-0" style={{ borderColor: "var(--border)" }}>
        {!isLoaded ? (
          <UserCardSkeleton />
        ) : summary.authenticated ? (
          <div className="flex flex-col gap-2">
            <Link
              href="/me"
              data-testid="sidebar-user-link"
              className="flex items-center gap-3 px-4 py-3 rounded-xl transition-colors"
              style={{ backgroundColor: "var(--surface-2)" }}
            >
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-xs"
                style={{ backgroundColor: "var(--accent)", color: "var(--brand-sub)" }}
              >
                {summary.name?.[0] || "U"}
              </div>
              <div className="flex-1 overflow-hidden">
                <div className="text-sm font-medium truncate" style={{ color: "var(--foreground)" }}>
                  {summary.name}
                </div>
                <div className="text-xs truncate" style={{ color: "var(--muted)" }}>
                  {summary.studentId || "GSHS.app"}
                </div>
              </div>
            </Link>
            <LogoutButton />
          </div>
        ) : (
          <Link
            href="/login"
            data-testid="sidebar-login-link"
            className="flex items-center justify-center gap-2 px-4 py-3 rounded-xl transition-colors font-medium"
            style={{ backgroundColor: "var(--brand-main)", color: "var(--brand-sub)" }}
          >
            로그인
          </Link>
        )}

        <div className="flex items-center justify-center pt-4">
          <ModeToggle />
        </div>
      </div>
    </aside>
  );
}
