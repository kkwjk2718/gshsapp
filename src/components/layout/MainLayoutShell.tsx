"use client";

import { useEffect, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { HomePersonalizationProvider } from "@/app/(main)/home-personalization";
import { DesktopUtilityHeader } from "./DesktopUtilityHeader";
import { Sidebar } from "./Sidebar";

type MainLayoutShellProps = {
  children: ReactNode;
  footer: ReactNode;
  homeWeather: ReactNode;
};

export function MainLayoutShell({ children, footer, homeWeather }: MainLayoutShellProps) {
  const pathname = usePathname();
  const isHome = pathname === "/";
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState(false);

  useEffect(() => {
    setIsDesktopSidebarOpen(false);
  }, [pathname]);

  const content = (
    <>
      <Sidebar
        open={isDesktopSidebarOpen}
        onOpenChange={setIsDesktopSidebarOpen}
        onNavigate={() => setIsDesktopSidebarOpen(false)}
      />
      <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0">
        <DesktopUtilityHeader
          isHome={isHome}
          homeWeather={homeWeather}
          isSidebarOpen={isDesktopSidebarOpen}
          onSidebarToggle={() => setIsDesktopSidebarOpen((open) => !open)}
        />
        <div className="flex-1">
          {children}
        </div>
        {footer}
      </main>
    </>
  );

  const wrappedContent = (
    <div className="relative flex min-h-screen min-w-0 flex-1">
      {content}
    </div>
  );

  if (isHome) {
    return <HomePersonalizationProvider>{wrappedContent}</HomePersonalizationProvider>;
  }

  return wrappedContent;
}
