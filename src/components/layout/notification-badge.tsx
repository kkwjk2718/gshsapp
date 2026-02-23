"use client";

import { useEffect, useState } from "react";
import { getUnreadNotificationCount } from "@/app/(main)/notifications/actions";
import { cn } from "@/lib/utils";

interface NotificationBadgeProps {
    className?: string;
}

export function NotificationBadge({ className }: NotificationBadgeProps) {
    const [count, setCount] = useState(0);

    useEffect(() => {
        const fetchCount = async () => {
            const unreadCount = await getUnreadNotificationCount();
            setCount(unreadCount);
        };

        fetchCount();

        // Listen for custom event to trigger re-fetch
        const handleUpdate = () => {
            fetchCount();
        };
        window.addEventListener('notification-update', handleUpdate);

        // Optional: Poll every 60 seconds (or logic could be improved with SWR/Socket later)
        const interval = setInterval(fetchCount, 60000);

        return () => {
            clearInterval(interval);
            window.removeEventListener('notification-update', handleUpdate);
        };
    }, []);

    if (count === 0) return null;

    return (
        <span
            className={cn(
                "absolute bg-rose-500 rounded-full border-2 border-white dark:border-slate-900",
                "w-2.5 h-2.5 top-0 right-0", // Default: small dot
                className
            )}
        />
    );
}
