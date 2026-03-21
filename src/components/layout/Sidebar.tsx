"use client";

import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { Dialog, DialogOverlay, DialogPortal } from "@/components/ui/dialog";
import { SidebarNav } from "./SidebarNav";

type SidebarProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onNavigate: () => void;
};

export function Sidebar({ open, onOpenChange, onNavigate }: SidebarProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPortal>
        <DialogOverlay
          data-testid="desktop-sidebar-overlay"
          className="hidden md:block md:z-[50]"
          style={{ backgroundColor: "rgba(2, 8, 20, 0.42)" }}
        />
        <DialogPrimitive.Content
          aria-label="데스크톱 사이드바"
          className="fixed inset-y-0 left-0 z-[70] hidden w-[20rem] transform-gpu overflow-hidden border-r outline-none transition-transform duration-300 ease-out data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0 md:flex"
          style={{
            background:
              "linear-gradient(180deg, color-mix(in srgb, var(--surface) 92%, transparent), color-mix(in srgb, var(--surface-2) 96%, transparent))",
            borderColor: "color-mix(in srgb, var(--accent) 18%, var(--border) 82%)",
            boxShadow: "0 32px 80px color-mix(in srgb, var(--panel-glow) 42%, transparent)",
          }}
        >
          <DialogPrimitive.Title className="sr-only">데스크톱 사이드바</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            주요 페이지로 이동할 수 있는 데스크톱 네비게이션 메뉴입니다.
          </DialogPrimitive.Description>

          <aside id="desktop-sidebar-drawer" data-testid="desktop-sidebar-drawer" className="sidebar-shell relative flex h-full w-full flex-col px-4 py-3">
            <div
              className="relative flex items-center justify-between gap-3 border-b pb-3"
              style={{ borderColor: "color-mix(in srgb, var(--border) 72%, transparent)" }}
            >
              <div className="min-w-0">
                <Link
                  href="/"
                  onClick={onNavigate}
                  className="block text-[1.65rem] font-semibold leading-none tracking-[-0.05em]"
                  style={{ color: "var(--foreground)" }}
                >
                  GSHS.app
                </Link>
                <p className="mt-1.5 max-w-[15rem] text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
                  자주 사용하는 기능을 빠르게 이동할 수 있도록 정리했습니다.
                </p>
              </div>

              <DialogPrimitive.Close
                className="inline-flex h-10 w-10 items-center justify-center rounded-2xl border transition-colors"
                style={{
                  backgroundColor: "color-mix(in srgb, var(--surface-2) 78%, transparent)",
                  borderColor: "color-mix(in srgb, var(--border) 72%, transparent)",
                  color: "var(--foreground)",
                }}
                aria-label="사이드바 닫기"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <div className="relative mt-3 flex-1 overflow-hidden pr-1">
              <SidebarNav onNavigate={onNavigate} />
            </div>
          </aside>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
