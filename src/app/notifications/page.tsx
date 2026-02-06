import { prisma } from "@/lib/db";
import { Bell, Info, CheckCircle, Calendar, X } from "lucide-react";
import { format } from "date-fns";
import { getCurrentUser } from "@/lib/session";
import { Metadata } from "next";
import { markAsRead, deleteNotification } from "./actions";

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

    const getIcon = (type: string) => {
        switch (type) {
            case 'SONG': return <CheckCircle className="w-5 h-5" />;
            case 'SYSTEM': return <Info className="w-5 h-5" />;
            case 'NOTICE': return <Bell className="w-5 h-5" />;
            case 'SCHEDULE': return <Calendar className="w-5 h-5" />;
            default: return <Bell className="w-5 h-5" />;
        }
    };

    const getColor = (type: string, isRead: boolean) => {
        if (isRead) return 'text-slate-500 bg-slate-200 dark:bg-slate-800 dark:text-slate-500';

        switch (type) {
            case 'SONG': return 'text-emerald-500 bg-emerald-100 dark:bg-emerald-900/20';
            case 'SYSTEM': return 'text-rose-500 bg-rose-100 dark:bg-rose-900/20';
            case 'NOTICE': return 'text-amber-500 bg-amber-100 dark:bg-amber-900/20';
            default: return 'text-indigo-500 bg-indigo-100 dark:bg-indigo-900/20';
        }
    };

    return (
        <div className="p-4 md:p-8 space-y-6 max-w-2xl mx-auto">
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
                    <div
                        key={notif.id}
                        className={`glass-card p-4 flex gap-4 transition-all group ${notif.isRead ? 'opacity-60 bg-transparent border-slate-200 dark:border-slate-800' : 'hover:bg-white/5'}`}
                    >
                        <div className={`p-2 rounded-full h-fit mt-1 flex-shrink-0 transition-colors ${getColor(notif.type, notif.isRead)}`}>
                            {getIcon(notif.type)}
                        </div>
                        <div className="flex-1 cursor-pointer"> {/* Whole area could be clickable if we client-component-ize it, but for now let simple layout */}
                            <div className="flex justify-between items-start">
                                <h3 className={`font-bold ${notif.isRead ? 'text-slate-500 line-through decoration-slate-400/50' : 'text-slate-800 dark:text-slate-200'}`}>
                                    {notif.title}
                                </h3>
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-slate-400 whitespace-nowrap">
                                        {format(notif.createdAt, "MM.dd HH:mm")}
                                    </span>
                                    {/* Delete Button */}
                                    <form
                                        // @ts-ignore
                                        action={deleteNotification.bind(null, notif.id)}>
                                        <button className="text-slate-400 hover:text-rose-500 p-1">
                                            <X className="w-4 h-4" />
                                        </button>
                                    </form>
                                </div>
                            </div>
                            <div
                                className={`mt-1 text-sm leading-relaxed ${notif.isRead ? 'text-slate-400' : 'text-slate-600 dark:text-slate-400'}`}
                            //  onClick={() => !notif.isRead && markAsRead(notif.id)} // Can't do this easily in server component list map.
                            // Ideally strictly server actions with forms.
                            >
                                {notif.content}
                            </div>

                            {!notif.isRead && (
                                <div className="mt-2 flex">
                                    <form
                                        // @ts-ignore
                                        action={markAsRead.bind(null, notif.id)}>
                                        <button className="text-xs font-medium text-indigo-500 hover:text-indigo-600 flex items-center gap-1">
                                            <CheckCircle className="w-3 h-3" />
                                            읽음 처리
                                        </button>
                                    </form>
                                </div>
                            )}
                        </div>
                    </div>
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
