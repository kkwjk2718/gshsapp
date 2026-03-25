"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import { getVisibleNavItems } from "@/config/nav";
import { cn } from "@/lib/utils";
import { NotificationBadge } from "./notification-badge";
import { useUserSummary } from "@/components/user-summary-provider";

export function SidebarNav({ onNavigate }: { onNavigate?: () => void }) {
  const pathname = usePathname();
  const {
    summary: { role },
  } = useUserSummary();
  const visibleNavItems = getVisibleNavItems(role);

  return (
    <nav className="sidebar-nav flex w-full flex-col gap-1.5">
      {visibleNavItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            onClick={onNavigate}
            className={cn(
              "sidebar-nav-link flex w-full min-h-11 items-center gap-3 rounded-xl border px-3.5 py-2.5 text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]",
              isActive ? "" : "hover:bg-[color:var(--surface-2)]"
            )}
            style={isActive
              ? {
                  backgroundColor: "var(--surface-2)",
                  borderColor: "var(--accent)",
                  color: "var(--foreground)",
                }
              : {
                  backgroundColor: "transparent",
                  borderColor: "transparent",
                  color: "var(--muted)",
                }}
          >
            <div className="relative">
              <item.icon className="w-5 h-5" style={{ color: isActive ? "var(--accent)" : "var(--muted)" }} />
              {item.href === "/notifications" && <NotificationBadge className="-top-1 -right-1" />}
            </div>
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav >
  );
}
