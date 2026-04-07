import Link from "next/link";
import { AlertTriangle, Megaphone } from "lucide-react";

import {
  MEMBER_SERVICE_SUSPENSION_SUMMARY,
  MEMBER_SERVICE_SUSPENSION_TITLE,
} from "@/lib/member-service-suspension";

export function MemberFeaturesDisabledPanel({
  className = "",
}: {
  className?: string;
}) {
  return (
    <div
      className={`w-full rounded-[2rem] border border-amber-200 bg-amber-50/90 p-6 text-left shadow-lg dark:border-amber-500/20 dark:bg-amber-500/10 ${className}`}
    >
      <div className="flex items-start gap-3">
        <div className="mt-0.5 rounded-2xl bg-amber-500/15 p-3 text-amber-600 dark:text-amber-300">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <h2 className="text-xl font-bold text-amber-900 dark:text-amber-100">
            {MEMBER_SERVICE_SUSPENSION_TITLE}
          </h2>
          <p className="mt-2 text-sm leading-6 text-amber-900/90 dark:text-amber-100/90">
            {MEMBER_SERVICE_SUSPENSION_SUMMARY}
          </p>
          <div className="mt-4 flex flex-wrap gap-3">
            <Link
              href="/notices"
              className="inline-flex items-center gap-2 rounded-full bg-amber-600 px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-amber-700"
            >
              <Megaphone className="h-4 w-4" />
              공지사항 보기
            </Link>
            <a
              href="mailto:admin@gshs.app"
              className="inline-flex items-center rounded-full border border-amber-300 px-4 py-2 text-sm font-semibold text-amber-800 transition-colors hover:bg-amber-100 dark:border-amber-500/30 dark:text-amber-100 dark:hover:bg-amber-500/10"
            >
              admin@gshs.app
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}
