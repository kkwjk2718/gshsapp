"use client"

import { useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { allNavItems } from "@/config/nav";
import { cn } from "@/lib/utils";
import { NotificationBadge } from "./notification-badge";
import { ModeToggle } from "@/components/mode-toggle";

export function MobileMenu() {
    const [isOpen, setIsOpen] = useState(false);
    const pathname = usePathname();

    return (
        <>
            {/* Menu Button */}
            <button
                onClick={() => setIsOpen(true)}
                className="flex flex-col items-center justify-center p-2 rounded-xl transition-all w-16 min-h-11 text-slate-500 dark:text-slate-400"
            >
                <svg className="w-6 h-6 mb-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
                </svg>
                <span className="text-[10px] font-medium">메뉴</span>
            </button>

            {/* Full Screen Modal - Rendered via Portal */}
            {isOpen && typeof window !== 'undefined' && createPortal(
                <div className="fixed inset-0 z-[100] flex flex-col bg-white/95 dark:bg-slate-950/95 backdrop-blur-xl pb-[env(safe-area-inset-bottom)]">
                    {/* Header */}
                    <div className="flex items-center justify-between p-6 border-b border-slate-200 dark:border-slate-800">
                        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">전체 메뉴</h2>
                        <div className="flex items-center gap-2">
                            <ModeToggle className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-slate-800" />
                            <button
                                onClick={() => setIsOpen(false)}
                                className="p-2 rounded-xl hover:bg-slate-200 dark:hover:bg-white/5 text-slate-700 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-200 transition-colors"
                            >
                                <X className="w-6 h-6" />
                            </button>
                        </div>
                    </div>

                    {/* Menu Items */}
                    <div className="flex-1 overflow-y-auto p-4">
                        <nav className="grid grid-cols-2 gap-3">
                            {allNavItems.map((item) => {
                                const isActive = pathname === item.href;
                                return (
                                    <Link
                                        key={item.href}
                                        href={item.href}
                                        onClick={() => setIsOpen(false)}
                                        className={cn(
                                            "flex flex-col items-center gap-3 p-6 rounded-2xl transition-all",
                                            isActive
                                                ? "bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-500/20 dark:to-purple-500/20 border border-indigo-300 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-200"
                                                : "bg-slate-100 dark:bg-slate-900/50 border border-slate-200 dark:border-slate-800 text-slate-700 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-800/50 hover:text-slate-900 dark:hover:text-slate-200 hover:border-slate-300 dark:hover:border-slate-700"
                                        )}
                                    >
                                        <div className="relative">
                                            <item.icon className={cn("w-8 h-8", isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-700 dark:text-slate-500")} />
                                            {item.href === '/notifications' && <NotificationBadge className="w-3 h-3 top-0 right-0" />}
                                        </div>
                                        <span className="text-sm font-medium text-center">{item.name}</span>
                                    </Link>
                                );
                            })}
                        </nav>
                    </div>

                    {/* Footer */}
                    <div className="p-4 border-t border-slate-200 dark:border-slate-800 text-center">
                        <p className="text-xs text-slate-500 dark:text-slate-400">탭하여 페이지로 이동</p>
                    </div>
                </div>,
                document.body
            )}
        </>
    );
}
