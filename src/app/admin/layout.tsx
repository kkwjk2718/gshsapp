import { Metadata } from "next";

export const metadata: Metadata = {
  title: {
    template: "%s | 관리자",
    default: "관리자 대시보드",
  },
  robots: {
    index: false,
    follow: false,
  },
};

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
