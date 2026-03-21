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
      className="md:hidden fixed bottom-0 left-0 right-0 z-50 px-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]"
    >
      <nav
        className="mx-auto flex max-w-xl items-center justify-around rounded-[1.8rem] border px-2 py-2 shadow-2xl backdrop-blur-2xl"
        style={{
          borderColor: "color-mix(in srgb, var(--border) 78%, var(--accent) 22%)",
          background: "linear-gradient(180deg, color-mix(in srgb, var(--surface) 94%, transparent), color-mix(in srgb, var(--surface-2) 94%, transparent))",
        }}
      >
        {bottomNavItems.map((item) => {
          const isActive = pathname === item.href;

          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex flex-col items-center justify-center p-2 rounded-[1.2rem] transition-all w-16 min-h-11",
                isActive
                  ? "text-[color:var(--accent)]"
                  : "text-[color:var(--muted)]",
              )}
              style={isActive ? { backgroundColor: "color-mix(in srgb, var(--surface-2) 82%, transparent)" } : undefined}
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
