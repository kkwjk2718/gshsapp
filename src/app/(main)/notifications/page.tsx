import { Metadata } from "next";
import { Bell } from "lucide-react";

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";

import { DeleteReadButton } from "./delete-read-button";
import { NotificationItem } from "./notification-item";

export const metadata: Metadata = {
  title: "알림",
  robots: {
    index: false,
    follow: false,
  },
};

export default async function NotificationsPage() {
  const user = await getCurrentUser();

  if (!user) {
    return (
      <div className="bg-transparent p-8 text-center text-slate-400">
        로그인이 필요합니다.
      </div>
    );
  }

  const notifications = await prisma.notification.findMany({
    where: {
      userId: user.id,
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  const hasReadNotifications = notifications.some((notification) => notification.isRead);

  return (
    <div className="mobile-page mobile-safe-bottom mx-auto max-w-2xl space-y-6">
      <div className="mb-6 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-indigo-100 p-3 text-indigo-600 dark:bg-indigo-900/30">
            <Bell className="h-6 w-6" />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">알림 센터</h1>
            <p className="text-slate-500">새로운 소식을 확인하세요.</p>
          </div>
        </div>
        {hasReadNotifications ? <DeleteReadButton /> : null}
      </div>

      <div className="space-y-3">
        {notifications.map((notification) => (
          <NotificationItem key={notification.id} notification={notification} />
        ))}

        {notifications.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center text-slate-400">
            <Bell className="h-12 w-12 opacity-20" />
            <p>새로운 알림이 없습니다.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
