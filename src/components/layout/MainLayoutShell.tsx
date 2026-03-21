"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HomePersonalizationProvider } from "@/app/(main)/home-personalization";
import { DesktopUtilityHeader } from "./DesktopUtilityHeader";

type MainLayoutShellProps = {
  children: ReactNode;
  footer: ReactNode;
  homeWeather: ReactNode;
};

export function MainLayoutShell({ children, footer, homeWeather }: MainLayoutShellProps) {
  const pathname = usePathname();
  const isHome = pathname === "/";

  const content = (
    <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-56">
      <DesktopUtilityHeader isHome={isHome} homeWeather={homeWeather} />
      <div className="flex-1">
        {children}
      </div>
      {footer}
    </main>
  );

  if (isHome) {
    return <HomePersonalizationProvider>{content}</HomePersonalizationProvider>;
  }

  return content;
}
