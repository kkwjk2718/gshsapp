"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Bell, ChevronDown, LogIn, Menu, Radio, ShieldCheck, User } from "lucide-react";
import { ModeToggle } from "@/components/mode-toggle";
import { LogoutButton } from "@/components/auth/logout-button";
import { useUserSummary } from "@/components/user-summary-provider";
import { cn } from "@/lib/utils";
import { NotificationBadge } from "./notification-badge";
import { RealtimeClock } from "@/components/dashboard-widgets";
import { HomeHeaderMeta } from "@/app/(main)/home-personalization";

function QuickMenuLink({
  href,
  label,
  icon: Icon,
  testId,
  onSelect,
}: {
  href: string;
  label: string;
  icon: typeof Radio;
  testId: string;
  onSelect: () => void;
}) {
  return (
    <Link
      href={href}
      data-testid={testId}
      onClick={onSelect}
      className="flex min-h-10 items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition-colors hover:bg-[color:var(--surface-2)]"
      style={{ color: "var(--foreground)" }}
    >
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </Link>
  );
}

function UserMenuDropdown({
  showMusicLink,
  showAdminLink,
}: {
  showMusicLink: boolean;
  showAdminLink: boolean;
}) {
  const pathname = usePathname();
  const { summary } = useUserSummary();
  const [isOpen, setIsOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setIsOpen(false);
  }, [pathname]);

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
        className="inline-flex min-h-11 items-center gap-3 rounded-full border px-2.5 py-2 text-left transition-colors"
        style={{
          backgroundColor: "color-mix(in srgb, var(--surface) 88%, var(--surface-2) 12%)",
          borderColor: "color-mix(in srgb, var(--border) 82%, var(--accent) 18%)",
          color: "var(--foreground)",
          boxShadow: "0 12px 24px color-mix(in srgb, var(--accent) 8%, transparent)",
        }}
      >
        <div
          className="flex h-8 w-8 items-center justify-center rounded-full text-sm font-bold"
          style={{ backgroundColor: "var(--accent)", color: "var(--brand-sub)" }}
        >
          {summary.name?.[0] || "U"}
        </div>
        <div className="max-w-28 overflow-hidden">
          <div className="truncate text-sm font-semibold">{summary.name}</div>
          <div className="truncate text-[11px]" style={{ color: "var(--muted)" }}>
            {summary.studentId || "GSHS.app"}
          </div>
        </div>
        <ChevronDown className={cn("h-4 w-4 transition-transform", isOpen && "rotate-180")} />
      </button>

      {isOpen ? (
        <div
          data-testid="desktop-user-menu"
          role="menu"
          className="absolute right-0 top-full z-[80] mt-2 w-72 rounded-[1.4rem] border p-2 shadow-2xl backdrop-blur-xl"
          style={{
            backgroundColor: "color-mix(in srgb, var(--surface) 94%, transparent)",
            borderColor: "var(--border)",
          }}
        >
          <div className="rounded-[1.1rem] px-3 py-3" style={{ backgroundColor: "var(--surface-2)" }}>
            <div className="text-sm font-semibold" style={{ color: "var(--foreground)" }}>
              {summary.name}
            </div>
            <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
              {summary.studentId || "GSHS.app"}
            </div>
          </div>

          {showMusicLink || showAdminLink ? (
            <div className="px-1 pb-1 pt-3">
              <div
                className="px-3 pb-1 text-[11px] font-semibold uppercase tracking-[0.16em]"
                style={{ color: "var(--muted)" }}
              >
                빠른 이동
              </div>
              {showMusicLink ? (
                <QuickMenuLink
                  href="/music"
                  label="방송부 스튜디오"
                  icon={Radio}
                  testId="desktop-user-menu-link-music"
                  onSelect={() => setIsOpen(false)}
                />
              ) : null}
              {showAdminLink ? (
                <QuickMenuLink
                  href="/admin"
                  label="관리자 페이지"
                  icon={ShieldCheck}
                  testId="desktop-user-menu-link-admin"
                  onSelect={() => setIsOpen(false)}
                />
              ) : null}
            </div>
          ) : null}

          <div className="mx-1 my-2 h-px" style={{ backgroundColor: "var(--border)" }} />

          <Link
            href="/me"
            data-testid="desktop-user-menu-link-me"
            onClick={() => setIsOpen(false)}
            className="flex min-h-10 items-center gap-3 rounded-2xl px-3 py-2 text-sm font-medium transition-colors hover:bg-[color:var(--surface-2)]"
            style={{ color: "var(--foreground)" }}
          >
            <User className="h-4 w-4" />
            <span>내 정보</span>
          </Link>

          <LogoutButton
            className="mt-1 min-h-10 rounded-2xl px-3 py-2 text-sm font-medium hover:bg-[color:var(--surface-2)]"
            next={pathname === "/login" ? "/" : pathname}
            testId="desktop-user-menu-logout"
            onClick={() => setIsOpen(false)}
          />
        </div>
      ) : null}
    </div>
  );
}

export function DesktopUtilityHeader({
  isHome,
  homeWeather,
  isSidebarOpen,
  onSidebarToggle,
}: {
  isHome: boolean;
  homeWeather?: ReactNode;
  isSidebarOpen: boolean;
  onSidebarToggle: () => void;
}) {
  const pathname = usePathname();
  const { summary, isLoaded } = useUserSummary();
  const showMusicLink = summary.role === "BROADCAST" || summary.role === "ADMIN";
  const showAdminLink = summary.role === "ADMIN";
  const showLoginLink = pathname !== "/login";

  return (
    <div data-testid="desktop-utility-header" className="sticky top-0 z-[60] hidden px-4 pt-4 md:block">
      <div
        className="mx-auto w-full rounded-[1.65rem] border px-4 py-3 shadow-sm backdrop-blur-xl"
        style={{
          backgroundColor: "color-mix(in srgb, var(--surface) 88%, transparent)",
          borderColor: "color-mix(in srgb, var(--border) 88%, var(--accent) 12%)",
          boxShadow: "0 18px 40px color-mix(in srgb, var(--accent) 7%, transparent)",
        }}
      >
        <div className="flex min-h-[3.5rem] items-center justify-between gap-4">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <button
              type="button"
              data-testid="desktop-sidebar-toggle"
              aria-label={isSidebarOpen ? "사이드바 닫기" : "사이드바 열기"}
              aria-controls="desktop-sidebar-drawer"
              aria-expanded={isSidebarOpen}
              onClick={onSidebarToggle}
              className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border transition-colors"
              style={{
                backgroundColor: "color-mix(in srgb, var(--surface-2) 72%, var(--surface) 28%)",
                borderColor: "color-mix(in srgb, var(--border) 75%, var(--accent) 25%)",
                color: "var(--foreground)",
              }}
            >
              <Menu className="h-5 w-5" />
            </button>

            <Link
              href="/"
              data-testid="desktop-header-brand"
              className="shrink-0 text-lg font-semibold tracking-[-0.04em]"
              style={{ color: "var(--foreground)" }}
            >
              GSHS.app
            </Link>

            {isHome ? (
              <div
                data-testid="desktop-home-meta"
                className="ml-1 flex min-w-0 items-center gap-3 overflow-hidden rounded-full px-3 py-2 text-[12px]"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--surface-2) 50%, transparent)",
                  color: "var(--muted)",
                }}
              >
                <RealtimeClock compact />
                <HomeHeaderMeta />
              </div>
            ) : null}
          </div>

          <div className="flex shrink-0 items-center gap-2">
            {isHome && homeWeather ? (
              <div data-testid="desktop-home-weather" className="shrink-0">
                {homeWeather}
              </div>
            ) : null}

            <ModeToggle
              testId="desktop-header-theme-toggle"
              className="inline-flex h-11 w-11 items-center justify-center rounded-full border"
              style={{
                backgroundColor: "color-mix(in srgb, var(--surface-2) 68%, var(--surface) 32%)",
                borderColor: "color-mix(in srgb, var(--border) 78%, var(--accent) 22%)",
              }}
            />

            <Link
              href="/notifications"
              data-testid="desktop-header-notifications"
              className="relative inline-flex h-11 w-11 items-center justify-center rounded-full border transition-colors"
              style={{
                backgroundColor: "color-mix(in srgb, var(--surface-2) 68%, var(--surface) 32%)",
                borderColor: "color-mix(in srgb, var(--border) 78%, var(--accent) 22%)",
                color: "var(--foreground)",
              }}
            >
              <Bell className="h-[18px] w-[18px]" />
              <NotificationBadge className="right-2 top-2 border-[color:var(--surface)]" />
            </Link>

            {!isLoaded ? (
              <div
                className="h-11 w-36 animate-pulse rounded-full"
                style={{ backgroundColor: "var(--surface-2)" }}
              />
            ) : summary.authenticated ? (
              <UserMenuDropdown showMusicLink={showMusicLink} showAdminLink={showAdminLink} />
            ) : showLoginLink ? (
              <Link
                href="/login"
                data-testid="desktop-utility-login-link"
                className="inline-flex min-h-11 items-center gap-2 rounded-full border px-4 py-2 text-sm font-semibold transition-colors"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--surface) 72%, var(--surface-2) 28%)",
                  borderColor: "color-mix(in srgb, var(--border) 68%, var(--accent) 32%)",
                  color: "var(--foreground)",
                }}
              >
                <LogIn className="h-4 w-4" />
                <span>로그인</span>
              </Link>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
