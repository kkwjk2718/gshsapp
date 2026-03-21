"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mainNavItems } from "@/config/nav";
import { cn } from "@/lib/utils";
import { NotificationBadge } from "./notification-badge";

const navDescriptions: Record<string, string> = {
  "/": "대시보드",
  "/notices": "학교 공지",
  "/meals": "식단 정보",
  "/songs": "신청 및 현황",
  "/timetable": "개인 시간표",
  "/calendar": "월간 일정",
  "/links": "바로 이동",
  "/sites": "관련 링크",
  "/utils": "도구 모음",
};

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();

  return (
    <nav className="sidebar-nav flex w-full flex-col gap-1.5">
      {mainNavItems.map((item) => {
        const isActive = pathname === item.href;

        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "sidebar-nav-link flex w-full items-center gap-3 rounded-[1.15rem] border px-4 py-2.5 text-sm font-medium transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]",
              isActive ? "" : "hover:-translate-y-0.5",
            )}
            style={
              isActive
                ? {
                    background:
                      "linear-gradient(135deg, color-mix(in srgb, var(--surface-3) 90%, transparent), color-mix(in srgb, var(--surface-2) 90%, transparent))",
                    borderColor: "color-mix(in srgb, var(--accent) 34%, var(--border) 66%)",
                    color: "var(--foreground)",
                    boxShadow: "0 18px 34px color-mix(in srgb, var(--panel-glow) 28%, transparent)",
                  }
                : {
                    backgroundColor: "color-mix(in srgb, var(--surface) 44%, transparent)",
                    borderColor: "color-mix(in srgb, var(--border) 60%, transparent)",
                    color: "var(--muted)",
                  }
            }
          >
            <div
              className="relative flex h-8.5 w-8.5 shrink-0 items-center justify-center rounded-2xl border"
              style={{
                backgroundColor: isActive
                  ? "color-mix(in srgb, var(--accent) 22%, transparent)"
                  : "color-mix(in srgb, var(--surface-2) 72%, transparent)",
                borderColor: isActive
                  ? "color-mix(in srgb, var(--accent-2) 36%, transparent)"
                  : "color-mix(in srgb, var(--border) 66%, transparent)",
              }}
            >
              <item.icon className="h-[18px] w-[18px]" style={{ color: isActive ? "var(--accent-2)" : "var(--muted)" }} />
              {item.href === "/notifications" ? <NotificationBadge className="-right-1 -top-1" /> : null}
            </div>

            <div className="min-w-0">
              <span className="block truncate">{item.name}</span>
              <span
                className="mt-0.5 block text-[11px]"
                style={{
                  color: isActive
                    ? "color-mix(in srgb, var(--accent-2) 74%, var(--foreground) 26%)"
                    : "color-mix(in srgb, var(--muted) 78%, transparent)",
                }}
              >
                {navDescriptions[item.href] || item.href.replace("/", "").toUpperCase()}
              </span>
            </div>
          </Link>
        );
      })}
    </nav>
  );
}
