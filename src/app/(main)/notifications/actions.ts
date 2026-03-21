"use server"

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";

export async function markAsRead(notificationId: string) {
    const user = await getCurrentUser();
    if (!user) return { error: "Unauthorized" };

    try {
        await prisma.notification.update({
            where: { id: notificationId, userId: user.id },
            data: { isRead: true }
        });
        revalidatePath("/notifications");
    } catch (e) {
        return { error: "Failed" };
    }
}

export async function deleteNotification(notificationId: string) {
    const user = await getCurrentUser();
    if (!user) return { error: "Unauthorized" };

    try {
        await prisma.notification.delete({
            where: { id: notificationId, userId: user.id }
        });
        revalidatePath("/notifications");
    } catch (e) {
        revalidatePath("/notifications");
        return { error: "Failed" };
    }
}

export async function deleteReadNotifications() {
    const user = await getCurrentUser();
    if (!user) return { error: "Unauthorized" };

    try {
        await prisma.notification.deleteMany({
            where: {
                userId: user.id,
                isRead: true,
            },
        });
        revalidatePath("/notifications");
        return { success: true };
    } catch (e) {
        revalidatePath("/notifications");
        return { error: "Failed" };
    }
}

export async function getUnreadNotificationCount() {
    const user = await getCurrentUser();
    if (!user) return 0;

    try {
        const count = await prisma.notification.count({
            where: {
                userId: user.id,
                isRead: false
            }
        });
        return count;
    } catch (error) {
        return 0;
    }
}
