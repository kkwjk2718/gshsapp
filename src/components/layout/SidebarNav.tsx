"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mainNavItems } from "@/config/nav";
import { cn } from "@/lib/utils";
import { NotificationBadge } from "./notification-badge";

export function SidebarNav() {
  const pathname = usePathname();

  return (
    <nav className="space-y-1">
      {mainNavItems.map((item) => {
        const isActive = pathname === item.href;
        return (
          <Link
            key={item.href}
            href={item.href}
            className={cn(
              "flex items-center gap-3 px-4 py-3 rounded-xl border text-sm font-medium transition-colors duration-150 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--accent)]",
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