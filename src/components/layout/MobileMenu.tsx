"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createPortal } from "react-dom";
import { useState } from "react";
import { Radio, ShieldCheck, X } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { useUserSummary } from "@/components/user-summary-provider";
import { allNavItems } from "@/config/nav";
import { cn } from "@/lib/utils";
import { NotificationBadge } from "./notification-badge";

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
        type="button"
        onClick={() => setIsOpen(true)}
        className="flex min-h-11 w-16 flex-col items-center justify-center rounded-[1.2rem] p-2 transition-all"
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
              className="fixed inset-0 z-[100] flex flex-col pb-[env(safe-area-inset-bottom)] backdrop-blur-2xl"
              style={{
                background:
                  "linear-gradient(180deg, color-mix(in srgb, var(--surface) 98%, transparent), color-mix(in srgb, var(--surface-2) 98%, transparent))",
              }}
            >
              <div
                className="flex items-center justify-between border-b px-5 py-5"
                style={{ borderColor: "color-mix(in srgb, var(--border) 72%, transparent)" }}
              >
                <h2 className="text-xl font-bold" style={{ color: "var(--foreground)" }}>
                  전체 메뉴
                </h2>
                <div className="flex items-center gap-2">
                  <ModeToggle className="rounded-[1rem] border border-[color:var(--border)] bg-[color:var(--surface-2)] p-2" />
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="rounded-[1rem] border p-2 transition-colors"
                    style={{
                      color: "var(--foreground)",
                      borderColor: "color-mix(in srgb, var(--border) 72%, transparent)",
                    }}
                  >
                    <X className="h-6 w-6" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-5">
                <nav className="grid grid-cols-2 gap-3">
                  {menuItems.map((item) => {
                    const isActive = pathname === item.href;

                    return (
                      <Link
                        key={item.href}
                        href={item.href}
                        onClick={() => setIsOpen(false)}
                        className={cn("flex flex-col items-center gap-3 rounded-[1.6rem] border p-5 transition-all")}
                        style={
                          isActive
                            ? {
                                background:
                                  "linear-gradient(135deg, color-mix(in srgb, var(--surface-3) 90%, transparent), color-mix(in srgb, var(--surface-2) 94%, transparent))",
                                borderColor: "color-mix(in srgb, var(--accent) 34%, var(--border) 66%)",
                                color: "var(--foreground)",
                              }
                            : {
                                backgroundColor: "color-mix(in srgb, var(--surface) 90%, transparent)",
                                borderColor: "color-mix(in srgb, var(--border) 72%, transparent)",
                                color: "var(--muted)",
                              }
                        }
                      >
                        <div
                          className="relative flex h-12 w-12 items-center justify-center rounded-[1.15rem] border"
                          style={{
                            backgroundColor: isActive
                              ? "color-mix(in srgb, var(--accent) 18%, transparent)"
                              : "color-mix(in srgb, var(--surface-2) 82%, transparent)",
                            borderColor: isActive
                              ? "color-mix(in srgb, var(--accent-2) 34%, transparent)"
                              : "color-mix(in srgb, var(--border) 66%, transparent)",
                          }}
                        >
                          <item.icon className="h-6 w-6" style={{ color: isActive ? "var(--accent-2)" : "var(--muted)" }} />
                          {item.href === "/notifications" ? <NotificationBadge className="right-0 top-0 h-3 w-3" /> : null}
                        </div>
                        <span className="text-center text-sm font-medium">{item.name}</span>
                      </Link>
                    );
                  })}
                </nav>
              </div>

              <div className="border-t p-4 text-center" style={{ borderColor: "color-mix(in srgb, var(--border) 72%, transparent)" }}>
                <p className="text-xs" style={{ color: "var(--muted)" }}>
                  원하는 페이지로 빠르게 이동할 수 있습니다.
                </p>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
