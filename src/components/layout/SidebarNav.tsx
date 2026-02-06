"use client"

import Link from "next/link";
import { usePathname } from "next/navigation";
import { mainNavItems } from "@/config/nav";
import { cn } from "@/lib/utils";

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
              "flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-300 text-sm font-medium",
              isActive
                ? "bg-gradient-to-r from-indigo-100 to-purple-100 dark:from-indigo-500/20 dark:to-purple-500/20 border border-indigo-300 dark:border-indigo-500/30 text-indigo-700 dark:text-indigo-200 shadow-lg shadow-indigo-200/50 dark:shadow-indigo-500/10 backdrop-blur-md"
                : "text-slate-700 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-white/5 hover:text-slate-900 dark:hover:text-slate-200 hover:translate-x-1"
            )}
          >
            <item.icon className={cn("w-5 h-5", isActive ? "text-indigo-600 dark:text-indigo-400" : "text-slate-600 dark:text-slate-500")} />
            <span>{item.name}</span>
          </Link>
        );
      })}
    </nav >
  );
}