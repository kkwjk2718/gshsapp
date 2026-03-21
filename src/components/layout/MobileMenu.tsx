"use client";

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X, Radio, ShieldCheck } from "lucide-react";
import { allNavItems } from "@/config/nav";
import { cn } from "@/lib/utils";
import { NotificationBadge } from "./notification-badge";
import { ModeToggle } from "@/components/mode-toggle";
import { useUserSummary } from "@/components/user-summary-provider";

export function MobileMenu() {
  const [isOpen, setIsOpen] = useState(false);
  const pathname = usePathname();
  const {
    summary: { role },
  } = useUserSummary();

  const roleItems = [
    ...(role === "BROADCAST" || role === "ADMIN"
      ? [{ name: "방송부 스튜디오", href: "/music", icon: Radio }]
      : []),
    ...(role === "ADMIN"
      ? [{ name: "관리자 페이지", href: "/admin", icon: ShieldCheck }]
      : []),
  ];

  const menuItems = [...allNavItems, ...roleItems];

  return (
    <>
      <button
        onClick={() => setIsOpen(true)}
        className="flex flex-col items-center justify-center p-2 rounded-xl transition-all w-16 min-h-11"
        style={{ color: "var(--muted)" }}
      >
        <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
        </svg>
        <span className="text-[10px] font-medium">메뉴</span>
      </button>

      {isOpen && typeof window !== "undefined" && createPortal(
        <div
          className="fixed inset-0 z-[100] flex flex-col backdrop-blur-xl pb-[env(safe-area-inset-bottom)]"
          style={{ backgroundColor: "var(--surface)" }}
        >
          <div className="flex items-center justify-between p-6 border-b" style={{ borderColor: "var(--border)" }}>
            <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>전체 메뉴</h2>
            <div className="flex items-center gap-2">
              <ModeToggle className="p-2 rounded-xl" />
              <button
                onClick={() => setIsOpen(false)}
                className="p-2 rounded-xl transition-colors"
                style={{ color: "var(--foreground)" }}
              >
                <X className="w-6 h-6" />
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
                    className={cn("flex flex-col items-center gap-3 p-6 rounded-2xl transition-all border")}
                    style={isActive
                      ? { backgroundColor: "var(--surface-2)", borderColor: "var(--accent)", color: "var(--foreground)" }
                      : { backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--muted)" }}
                  >
                    <div className="relative">
                      <item.icon className="w-8 h-8" style={{ color: isActive ? "var(--accent)" : "var(--muted)" }} />
                      {item.href === "/notifications" && (
                        <NotificationBadge className="w-3 h-3 top-0 right-0" />
                      )}
                    </div>
                    <span className="text-sm font-medium text-center">{item.name}</span>
                  </Link>
                );
              })}
            </nav>
          </div>

          <div className="p-4 border-t text-center" style={{ borderColor: "var(--border)" }}>
            <p className="text-xs" style={{ color: "var(--muted)" }}>원하는 페이지로 이동</p>
          </div>
        </div>,
        document.body,
      )}
    </>
  );
}
