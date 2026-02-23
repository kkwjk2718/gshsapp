import { prisma } from "@/lib/db";
import { Bell } from "lucide-react";
import { getCurrentUser } from "@/lib/session";
import { Metadata } from "next";
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
    if (!user) return <div className="p-8 text-center bg-transparent text-slate-400">로그인이 필요합니다.</div>;

    // Filter expired notifications
    const notifications = await prisma.notification.findMany({
        where: {
            userId: user.id,
            OR: [
                // @ts-ignore
                { expiresAt: null },
                // @ts-ignore
                { expiresAt: { gt: new Date() } }
            ]
        },
        orderBy: { createdAt: "desc" },
        take: 50
    });



    return (
        <div className="mobile-page mobile-safe-bottom space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-3 mb-6">
                <div className="p-3 bg-indigo-100 dark:bg-indigo-900/30 rounded-full text-indigo-600">
                    <Bell className="w-6 h-6" />
                </div>
                <div>
                    <h1 className="text-2xl font-bold text-slate-800 dark:text-slate-100">알림 센터</h1>
                    <p className="text-slate-500">새로운 소식을 확인하세요.</p>
                </div>
            </div>

            <div className="space-y-3">
                {notifications.map(notif => (
                    <NotificationItem key={notif.id} notification={notif} />
                ))}

                {notifications.length === 0 && (
                    <div className="text-center py-12 flex flex-col items-center gap-3 text-slate-400">
                        <Bell className="w-12 h-12 opacity-20" />
                        <p>새로운 알림이 없습니다.</p>
                    </div>
                )}
            </div>
        </div>
    )
}
