"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Radio, ShieldCheck, X } from "lucide-react";

import { getVisibleMobileNavItems } from "@/config/nav";
import { ModeToggle } from "@/components/mode-toggle";
import { useUserSummary } from "@/components/user-summary-provider";
import { canAccessAdmin, canAccessBroadcastStudio } from "@/lib/user-roles";
import { cn } from "@/lib/utils";

import { NotificationBadge } from "./notification-badge";

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const {
    summary: { role },
  } = useUserSummary();

  const roleItems = [
    ...(canAccessBroadcastStudio(role)
      ? [{ name: "방송부 스튜디오", href: "/music", icon: Radio }]
      : []),
    ...(canAccessAdmin(role)
      ? [{ name: "관리자 페이지", href: "/admin", icon: ShieldCheck }]
      : []),
  ];

  const menuItems = [...getVisibleMobileNavItems(role), ...roleItems];

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex min-h-11 w-16 flex-col items-center justify-center rounded-xl p-2 transition-all"
        style={{ color: "var(--muted)" }}
      >
        <svg className="mb-1 h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span className="text-[10px] font-medium">메뉴</span>
      </button>

      {isOpen && typeof window !== "undefined"
        ? createPortal(
            <div
              className="fixed inset-0 z-[100] flex flex-col backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
              style={{ backgroundColor: "var(--surface)" }}
            >
              <div className="flex items-center justify-between border-b p-6" style={{ borderColor: "var(--border)" }}>
                <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
                  전체 메뉴
                </h2>
                <div className="flex items-center gap-2">
                  <ModeToggle className="rounded-xl p-2" />
                  <button
                    onClick={() => setIsOpen(false)}
                    className="rounded-xl p-2 transition-colors"
                    style={{ color: "var(--foreground)" }}
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-4">
                <nav className="grid grid-cols-2 gap-3">
                  {menuItems.map((item) => {
                    const isActive = pathname === item.href;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className={cn("flex flex-col items-center gap-3 rounded-2xl border p-6 transition-all")}
                        style={
                          isActive
                            ? {
                                backgroundColor: "var(--surface-2)",
                                borderColor: "var(--accent)",
                                color: "var(--foreground)",
                              }
                            : {
                                backgroundColor: "var(--surface)",
                                borderColor: "var(--border)",
                                color: "var(--muted)",
                              }
                        }
                      >
                        <div className="relative">
                          <item.icon
                            className="h-8 w-8"
                            style={{ color: isActive ? "var(--accent)" : "var(--muted)" }}
                          />
                          {item.href === "/notifications" ? (
                            <NotificationBadge className="right-0 top-0 h-3 w-3" />
                          ) : null}
                        </div>
                        <span className="text-center text-sm font-medium">{item.name}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div className="border-t p-4 text-center" style={{ borderColor: "var(--border)" }}>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  원하는 페이지로 바로 이동할 수 있습니다.
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
