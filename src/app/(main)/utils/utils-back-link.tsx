"use client";

import Link from "next/link";
import { ArrowLeft } from "lucide-react";

type UtilsBackLinkProps = {
  href?: string;
  ariaLabel?: string;
};

export function UtilsBackLink({
  href = "/utils",
  ariaLabel = "도구 모음으로 돌아가기",
}: UtilsBackLinkProps) {
  return (
    <Link
      href={href}
      aria-label={ariaLabel}
      className="tap-target -ml-2 mr-2 inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-full border border-slate-200 bg-white/85 text-slate-500 shadow-sm transition-colors hover:bg-slate-100 hover:text-slate-700 dark:border-slate-700 dark:bg-slate-900/85 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-slate-100"
    >
      <ArrowLeft className="h-5 w-5" />
    </Link>
  );
}
