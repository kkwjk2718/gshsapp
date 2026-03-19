import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import Script from 'next/script';
import { Analytics } from "@/components/analytics";
import { Noto_Sans_KR } from "next/font/google";
import { Toaster } from "sonner";
import { DevServiceWorkerReset } from "@/components/dev-sw-reset";

const notoSansKr = Noto_Sans_KR({
  subsets: ["latin"],
  weight: ["100", "300", "400", "500", "700", "900"],
  variable: "--font-noto-sans-kr",
  display: "swap",
});

const siteUrl = process.env.NEXT_PUBLIC_APP_URL || "https://gshs.app";

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: "GSHS.app - 경남과학고등학교 학생 통합 플랫폼",
    template: "%s | GSHS.app",
  },
  description: "경남과학고등학교 학생들을 위한 급식, 시간표, 기상곡 신청, 학사일정, 공지사항, 생활 가이드 등 모든 정보를 제공하는 통합 플랫폼입니다.",
  keywords: [
    "경남과학고등학교", "경남과학고", "GSHS.app", "GSHS", "급식", "시간표", "학사일정", "기상곡", "공지사항", "학생플랫폼"
  ],
  authors: [{ name: "GSHS App Team" }],
  creator: "GSHS App Team",
  publisher: "GSHS App Team",
  openGraph: {
    type: "website",
    locale: "ko_KR",
    url: siteUrl,
    siteName: "GSHS.app - 경남과학고등학교 학생 통합 플랫폼",
    title: "GSHS.app - 경남과학고등학교 학생 통합 플랫폼",
    description: "경남과학고등학교 학생들을 위한 급식, 시간표, 기상곡 신청, 학사일정, 공지사항, 생활 가이드 등 모든 정보를 제공하는 통합 플랫폼입니다.",
    images: [
      {
        url: `${siteUrl}/og-image.png`,
        width: 1200,
        height: 630,
        alt: "GSHS.app - 경남과학고등학교 학생 통합 플랫폼",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "GSHS.app - 경남과학고등학교 학생 통합 플랫폼",
    description: "경남과학고등학교 학생들을 위한 급식, 시간표, 기상곡 신청, 학사일정, 공지사항, 생활 가이드 등 모든 정보를 제공하는 통합 플랫폼입니다.",
    creator: "@GSHSAppTeam",
    images: [`${siteUrl}/og-image.png`],
  },
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      'max-video-preview': -1,
      'max-image-preview': 'large',
      'max-snippet': -1,
    },
  },
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#0f172a",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_ID;

  return (
    <html lang="ko" suppressHydrationWarning>
      <body className={`antialiased bg-slate-50 dark:bg-slate-950 transition-colors duration-300 ${notoSansKr.className} ${notoSansKr.variable}`}>
        <Script
          id="theme-migrate"
          strategy="beforeInteractive"
          dangerouslySetInnerHTML={{
            __html: `
              (function() {
                try {
                  var params = new URLSearchParams(location.search);
                  var forced = params.get('theme');
                  if (forced === 'light' || forced === 'dark') {
                    localStorage.setItem('theme', forced);
                  }
                  var t = localStorage.getItem('theme');
                  var dark = window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
                  var effective = (t === 'dark' || t === 'light') ? t : (dark ? 'dark' : 'light');
                  var root = document.documentElement;
                  root.classList.remove('light', 'dark');
                  root.classList.add(effective);
                  root.style.colorScheme = effective;
                } catch (e) {}
              })();
            `,
          }}
        />
        {gaId && (
          <>
            <Script
              strategy="afterInteractive"
              src={`https://www.googletagmanager.com/gtag/js?id=${gaId}`}
            />
            <Script
              id="google-analytics-init"
              strategy="afterInteractive"
              dangerouslySetInnerHTML={{
                __html: `
                  window.dataLayer = window.dataLayer || [];
                  function gtag(){dataLayer.push(arguments);}
                  gtag('js', new Date());
                  gtag('config', '${gaId}', {
                    page_path: window.location.pathname,
                  });
                `,
              }}
            />
          </>
        )}
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          <DevServiceWorkerReset />
          <Analytics />
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
