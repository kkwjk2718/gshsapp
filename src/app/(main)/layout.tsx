import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
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
        <main className="flex-1 md:pl-64 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:pb-0 min-h-screen flex flex-col overflow-x-hidden">
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
