"use client";

import { cn } from "@/lib/utils";
import { useUserSummary } from "@/components/user-summary-provider";

interface NotificationBadgeProps {
  className?: string;
}

export function NotificationBadge({ className }: NotificationBadgeProps) {
  const {
    summary: { unreadNotificationCount },
  } = useUserSummary();

  if (unreadNotificationCount === 0) {
    return null;
  }

  return (
    <span
      className={cn(
        "absolute bg-rose-500 rounded-full border-2 border-white dark:border-slate-900",
        "w-2.5 h-2.5 top-0 right-0",
        className,
      )}
    />
  );
}
