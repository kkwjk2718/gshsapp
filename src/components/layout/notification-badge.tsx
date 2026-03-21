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
        "absolute rounded-full border-2 border-[color:var(--surface)] shadow-[0_0_14px_rgba(75,216,255,0.45)]",
        "w-2.5 h-2.5 top-0 right-0",
        className,
      )}
      style={{ backgroundColor: "var(--accent-2)" }}
    />
  );
}
