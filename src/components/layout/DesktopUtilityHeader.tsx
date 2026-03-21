"use client";

import { useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, LogIn, Radio, ShieldCheck, User } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { LogoutButton } from "@/components/auth/logout-button";
import { useUserSummary } from "@/components/user-summary-provider";
import { cn } from "@/lib/utils";
import { NotificationBadge } from "./notification-badge";
import { RealtimeClock } from "@/components/dashboard-widgets";
import { HomeHeaderMeta } from "@/app/(main)/home-personalization";

function UtilityLink({
  href,
  label,
  icon: Icon,
  active,
  testId,
}: {
  href: string;
  label: string;
  icon: ComponentType<{ className?: string }>;
  active: boolean;
  testId?: string;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      className="inline-flex min-h-10 items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-colors"
      style={active
        ? {
            backgroundColor: "var(--surface-2)",
            borderColor: "var(--accent)",
            color: "var(--foreground)",
          }
        : {
            backgroundColor: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--muted)",
          }}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}

function UserMenuDropdown() {
  const pathname = usePathname();
  const { summary } = useUserSummary();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const handlePointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isOpen]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        data-testid="desktop-user-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((open) => !open)}
        className="inline-flex min-h-11 items-center gap-3 rounded-full border px-3 py-2 text-left transition-colors"
        style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)", color: "var(--foreground)" }}
      >
        <div
          className="flex h-9 w-9 items-center justify-center rounded-full text-sm font-bold"
          style={{ backgroundColor: "var(--accent)", color: "var(--brand-sub)" }}
        >
          {summary.name?.[0] || "U"}
        </div>
        <div className="max-w-36 overflow-hidden">
          <div className="truncate text-sm font-semibold">{summary.name}</div>
          <div className="truncate text-xs" style={{ color: "var(--muted)" }}>
            {summary.studentId || "GSHS.app"}
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen && (
        <div
          data-testid="desktop-user-menu"
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-64 rounded-2xl border p-2 shadow-xl backdrop-blur-xl"
          style={{ backgroundColor: "var(--surface)", borderColor: "var(--border)" }}
        >
          <Link
            href="/me"
            data-testid="desktop-user-menu-link-me"
            onClick={() => setIsOpen(false)}
            className="flex min-h-11 items-center gap-3 rounded-xl px-3 py-2 text-sm font-medium transition-colors hover:bg-[color:var(--surface-2)]"
            style={{ color: "var(--foreground)" }}
          >
            <User className="h-4 w-4" />
            <span>내 정보</span>
          </Link>

          <div
            data-testid="desktop-user-menu-theme"
            className="mt-1 flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2"
            style={{ color: "var(--foreground)" }}
          >
            <span className="text-sm font-medium">테마 변경</span>
            <ModeToggle className="border border-[color:var(--border)] bg-[color:var(--surface-2)]" />
          </div>

          <LogoutButton
            className="mt-1 min-h-11 rounded-xl px-3 py-2 text-sm font-medium hover:bg-[color:var(--surface-2)]"
            next={pathname === "/login" ? "/" : pathname}
            testId="desktop-user-menu-logout"
            onClick={() => setIsOpen(false)}
          />
        </div>
      )}
    </div>
  );
}

export function DesktopUtilityHeader({
  isHome,
  homeWeather,
}: {
  isHome: boolean;
  homeWeather?: ReactNode;
}) {
  const pathname = usePathname();
  const { summary, isLoaded } = useUserSummary();
  const showMusicLink = summary.role === "BROADCAST" || summary.role === "ADMIN";
  const showAdminLink = summary.role === "ADMIN";
  const showLoginLink = pathname !== "/login";

  return (
    <div
      data-testid="desktop-utility-header"
      className="sticky top-0 z-40 hidden md:block border-b backdrop-blur-xl"
      style={{ borderColor: "var(--border)", backgroundColor: "color-mix(in srgb, var(--surface) 92%, transparent)" }}
    >
      <div className="mx-auto flex min-h-16 w-full items-center justify-between gap-4 px-6 py-3">
        <div className="flex min-w-0 flex-1 items-center gap-3">
          {isHome ? (
            <div
              data-testid="desktop-home-meta"
              className="flex min-w-0 items-center gap-3 text-xs"
              style={{ color: "var(--muted)" }}
            >
              <RealtimeClock compact />
              <HomeHeaderMeta />
            </div>
          ) : (
            <div className="flex-1" />
          )}
        </div>

        <div className="flex items-center gap-3">
          {isHome && homeWeather ? (
            <div data-testid="desktop-home-weather" className="shrink-0">
              {homeWeather}
            </div>
          ) : null}

          <Link
            href="/notifications"
            data-testid="desktop-header-notifications"
            className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors"
            style={{ backgroundColor: "var(--surface-2)", borderColor: "var(--border)", color: "var(--foreground)" }}
          >
            <Bell className="h-5 w-5" />
            <NotificationBadge className="top-2 right-2 border-[color:var(--surface)]" />
          </Link>

          {showMusicLink && (
            <UtilityLink
              href="/music"
              label="방송부 스튜디오"
              icon={Radio}
              active={pathname === "/music"}
              testId="desktop-quick-link-music"
            />
          )}
          {showAdminLink && (
            <UtilityLink
              href="/admin"
              label="관리자 페이지"
              icon={ShieldCheck}
              active={pathname.startsWith("/admin")}
              testId="desktop-quick-link-admin"
            />
          )}
          {!isLoaded ? (
            <div
              className="h-11 w-40 animate-pulse rounded-full"
              style={{ backgroundColor: "var(--surface-2)" }}
            />
          ) : summary.authenticated ? (
            <UserMenuDropdown />
          ) : showLoginLink ? (
            <Link
              href="/login"
              data-testid="desktop-utility-login-link"
              className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors"
              style={{ backgroundColor: "var(--accent)", borderColor: "var(--accent)", color: "var(--brand-sub)" }}
            >
              <LogIn className="h-4 w-4" />
              <span>로그인</span>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}
