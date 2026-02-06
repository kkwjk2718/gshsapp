import { Metadata } from "next";

export const metadata: Metadata = {
  title: "로그인",
  description: "GSHS.app에 로그인하여 개인화된 서비스를 이용하세요.",
};

export default function LoginLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
