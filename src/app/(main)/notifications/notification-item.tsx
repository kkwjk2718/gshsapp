"use client";

import { useTransition } from "react";
import { CheckCircle, X, Bell, Info, Calendar } from "lucide-react";
import { format } from "date-fns";
import { markAsRead, deleteNotification } from "@/app/(main)/notifications/actions";

interface NotificationItemProps {
    notification: {
        id: string;
        type: string;
        title: string;
        content: string;
        isRead: boolean;
        createdAt: Date;
    };
}

export function NotificationItem({ notification }: NotificationItemProps) {
    const [isPending, startTransition] = useTransition();

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

    const handleMarkAsRead = () => {
        startTransition(async () => {
            await markAsRead(notification.id);
            window.dispatchEvent(new CustomEvent('notification-update'));
        });
    };

    const handleDelete = () => {
        if (!confirm("알림을 삭제하시겠습니까?")) return;
        startTransition(async () => {
            await deleteNotification(notification.id);
            window.dispatchEvent(new CustomEvent('notification-update'));
        });
    };

    return (
        <div
            className={`glass-card p-4 flex gap-4 transition-all group ${notification.isRead ? 'opacity-60 bg-transparent border-slate-200 dark:border-slate-800' : 'hover:bg-white/5'}`}
        >
            <div className={`p-2 rounded-full h-fit mt-1 flex-shrink-0 transition-colors ${getColor(notification.type, notification.isRead)}`}>
                {getIcon(notification.type)}
            </div>
            <div className="flex-1">
                <div className="flex flex-col sm:flex-row sm:justify-between sm:items-start gap-2">
                    <h3 className={`font-bold ${notification.isRead ? 'text-slate-500 line-through decoration-slate-400/50' : 'text-slate-800 dark:text-slate-200'}`}>
                        {notification.title}
                    </h3>
                    <div className="flex items-center gap-1 self-end sm:self-auto">
                        <span className="text-xs text-slate-400 whitespace-nowrap">
                            {format(notification.createdAt, "MM.dd HH:mm")}
                        </span>
                        <button
                            onClick={handleDelete}
                            disabled={isPending}
                            className="text-slate-400 hover:text-rose-500 p-2 tap-target disabled:opacity-50"
                        >
                            <X className="w-4 h-4" />
                        </button>
                    </div>
                </div>
                <div className={`mt-1 text-sm leading-relaxed ${notification.isRead ? 'text-slate-400' : 'text-slate-600 dark:text-slate-400'}`}>
                    {notification.content}
                </div>

                {!notification.isRead && (
                    <div className="mt-2 flex">
                        <button
                            onClick={handleMarkAsRead}
                            disabled={isPending}
                            className="text-xs font-medium text-indigo-500 hover:text-indigo-600 flex items-center gap-1 disabled:opacity-50"
                        >
                            <CheckCircle className="w-3 h-3" />
                            읽음 처리
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
