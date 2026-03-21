"use client";

import Link from "next/link";
import { PlusCircle } from "lucide-react";
import { useUserSummary } from "@/components/user-summary-provider";

export function NoticesCreateLink() {
  const { summary, isLoaded } = useUserSummary();
  const canWrite = summary.role === "ADMIN" || summary.role === "TEACHER";

  if (!isLoaded || !canWrite) {
    return null;
  }

  return (
    <Link
      href="/admin/notices/new"
      className="flex items-center justify-center gap-2 px-4 py-2.5 tap-target font-bold rounded-xl transition-colors w-full sm:w-auto"
      style={{ backgroundColor: "var(--accent)", color: "var(--brand-sub)" }}
    >
      <PlusCircle className="w-4 h-4" />
      새 공지 작성
    </Link>
  );
}
