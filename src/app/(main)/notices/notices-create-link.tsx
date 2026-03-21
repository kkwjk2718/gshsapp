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
    <Link href="/admin/notices/new" className="btn-primary w-full px-4 py-2.5 text-sm sm:w-auto">
      <PlusCircle className="h-4 w-4" />
      새 공지 작성
    </Link>
  );
}
