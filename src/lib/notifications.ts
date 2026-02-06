
import { prisma } from "@/lib/db";

export type NotificationType = "SYSTEM" | "NOTICE" | "SONG" | "SCHEDULE";

export async function createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    content: string,
    link?: string,
    expiresAt?: Date
) {
    try {
        await prisma.notification.create({
            data: {
                userId,
                type,
                title,
                content,
                link,
                // @ts-ignore
                expiresAt,
            },
        });
    } catch (error) {
        console.error("Failed to create notification:", error);
    }
}
