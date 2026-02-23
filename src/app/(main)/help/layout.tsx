import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "도움말",
  description: "GSHS.app 자주 묻는 질문과 이용 안내",
  alternates: { canonical: "/help" },
};

export default function HelpLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
