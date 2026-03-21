"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { bottomNavItems } from "@/config/nav";
import { MobileMenu } from "./MobileMenu";
import { cn } from "@/lib/utils";

export function BottomNav() {
  const pathname = usePathname();

  return (
    <div
      className="md:hidden fixed bottom-0 left-0 right-0 border-t backdrop-blur-xl z-50 pb-[env(safe-area-inset-bottom)] shadow-lg"
      style={{ borderColor: "var(--border)", backgroundColor: "var(--surface)" }}
    >
      <nav className="flex items-center justify-around px-2 py-2">
        {bottomNavItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center p-2 rounded-xl transition-all w-16 min-h-11",
                isActive
                  ? "text-[color:var(--accent)]"
                  : "text-[color:var(--muted)]",
              )}
            >
              <item.icon className={cn("w-6 h-6 mb-1", isActive && "fill-current")} strokeWidth={isActive ? 2.5 : 2} />
              <span className="text-[10px] font-medium">{item.name}</span>
            </Link>
          );
        })}

        <MobileMenu />
      </nav>
    </div>
  );
}
