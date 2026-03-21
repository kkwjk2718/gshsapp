import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { DesktopUtilityHeader } from "@/components/layout/DesktopUtilityHeader";
import { Footer } from "@/components/layout/Footer";
import { UserSummaryProvider } from "@/components/user-summary-provider";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <UserSummaryProvider>
      <div className="flex min-h-screen">
        <Sidebar />
        <main className="flex min-h-screen min-w-0 flex-1 flex-col overflow-x-hidden pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0 md:pl-56">
          <DesktopUtilityHeader />
          <div className="flex-1">
            {children}
          </div>
          <Footer />
        </main>
        <BottomNav />
      </div>
    </UserSummaryProvider>
  );
}
