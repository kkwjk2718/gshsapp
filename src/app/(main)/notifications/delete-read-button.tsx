"use client";

import { useTransition } from "react";
import { Trash2 } from "lucide-react";
import { deleteReadNotifications } from "./actions";

export function DeleteReadButton() {
    const [isPending, startTransition] = useTransition();

    const handleClick = () => {
        if (!confirm("읽은 알림을 모두 삭제하시겠습니까?")) {
            return;
        }

        startTransition(async () => {
            await deleteReadNotifications();
            window.dispatchEvent(new CustomEvent("notification-update"));
        });
    };

    return (
        <button
            type="button"
            onClick={handleClick}
            disabled={isPending}
            className="inline-flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{ color: "var(--muted)" }}
        >
            <Trash2 className="h-4 w-4" />
            <span>읽은 알림 모두 삭제</span>
        </button>
    );
}
