import { BottomNav } from "@/components/layout/BottomNav";
import { Footer } from "@/components/layout/Footer";
import { MainLayoutShell } from "@/components/layout/MainLayoutShell";
import { UserSummaryProvider } from "@/components/user-summary-provider";
import { WeatherWidget } from "@/components/weather-widget";

export default function MainLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <UserSummaryProvider>
      <div className="flex min-h-screen">
        <MainLayoutShell footer={<Footer />} homeWeather={<WeatherWidget />}>
          {children}
        </MainLayoutShell>
        <BottomNav />
      </div>
    </UserSummaryProvider>
  );
}
