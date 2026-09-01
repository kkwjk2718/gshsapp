
import { prisma } from "@/lib/db";
import { normalizeNotificationLink } from "@/lib/security/public-input";
import type { Prisma } from "@prisma/client";

export type NotificationType = "SYSTEM" | "NOTICE" | "SONG" | "SCHEDULE";
export const MAX_NOTIFICATION_ROWS = 250_000;
export const MAX_NOTIFICATIONS_PER_USER = 500;
const NOTIFICATION_RETENTION_MS = 365 * 86_400_000;

type NotificationLifecycleDb = Pick<Prisma.TransactionClient, "notification">;

export async function enforceNotificationLifecycle(
    db: NotificationLifecycleDb,
    expectedRows: number,
    now = new Date(),
) {
    if (!Number.isInteger(expectedRows) || expectedRows < 1 || expectedRows > 5_000) {
        throw new Error("Invalid notification batch size");
    }
    await db.notification.deleteMany({
        where: {
            OR: [
                { expiresAt: { lt: now } },
                { createdAt: { lt: new Date(now.getTime() - NOTIFICATION_RETENTION_MS) } },
            ],
        },
    });
    if (await db.notification.count() + expectedRows > MAX_NOTIFICATION_ROWS) {
        throw new Error("Notification storage limit reached");
    }
}

export async function createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    content: string,
    link?: string,
    expiresAt?: Date
) {
    const safeLink = normalizeNotificationLink(link);
    if (link && !safeLink) throw new Error("Invalid notification link");
    const now = new Date();
    await prisma.$transaction(async (tx) => {
        await enforceNotificationLifecycle(tx, 1, now);
        await tx.notification.create({
            data: {
                userId,
                type,
                title,
                content,
                link: safeLink,
                expiresAt: expiresAt ?? null,
            },
        });
        const overflow = await tx.notification.findMany({
            where: { userId },
            select: { id: true },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: MAX_NOTIFICATIONS_PER_USER,
            take: 1_000,
        });
        if (overflow.length) {
            await tx.notification.deleteMany({ where: { id: { in: overflow.map((row) => row.id) } } });
        }
    });
}
