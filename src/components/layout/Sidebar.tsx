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
          className="hidden bg-black/18 backdrop-blur-[2px] md:block md:z-[50]"
        />
        <DialogPrimitive.Content
          id="desktop-sidebar-drawer"
          data-testid="desktop-sidebar-drawer"
          aria-label="데스크톱 사이드바"
          className="fixed inset-y-0 left-0 z-[70] hidden w-[18rem] transform-gpu border-r outline-none transition-transform duration-200 ease-out data-[state=closed]:-translate-x-full data-[state=open]:translate-x-0 md:flex"
          style={{
            backgroundColor: "color-mix(in srgb, var(--surface) 96%, transparent)",
            borderColor: "var(--border)",
            boxShadow: "0 28px 80px color-mix(in srgb, var(--foreground) 14%, transparent)",
          }}
        >
          <DialogPrimitive.Title className="sr-only">데스크톱 사이드바</DialogPrimitive.Title>
          <DialogPrimitive.Description className="sr-only">
            주요 페이지로 이동할 수 있는 데스크톱용 네비게이션 메뉴입니다.
          </DialogPrimitive.Description>
          <aside className="sidebar-shell flex h-full w-full flex-col px-4 py-4">
            <div className="flex items-center justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--border)" }}>
              <div className="min-w-0">
                <Link
                  href="/"
                  onClick={onNavigate}
                  className="block text-[1.7rem] font-bold leading-none tracking-[-0.04em]"
                  style={{ color: "var(--foreground)" }}
                >
                  GSHS.app
                </Link>
                <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
                  원하는 페이지로 빠르게 이동하세요.
                </p>
              </div>
              <DialogPrimitive.Close
                className="inline-flex h-10 w-10 items-center justify-center rounded-full border transition-colors"
                style={{
                  backgroundColor: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--foreground)",
                }}
                aria-label="사이드바 닫기"
              >
                <X className="h-4 w-4" />
              </DialogPrimitive.Close>
            </div>

            <div className="mt-5 flex-1 overflow-y-auto pr-1">
              <SidebarNav onNavigate={onNavigate} />
            </div>
          </aside>
        </DialogPrimitive.Content>
      </DialogPortal>
    </Dialog>
  );
}
