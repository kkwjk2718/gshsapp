
import { prisma } from "@/lib/db";
import { normalizeNotificationLink } from "@/lib/security/public-input";

export type NotificationType = "SYSTEM" | "NOTICE" | "SONG" | "SCHEDULE";

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
        await tx.notification.deleteMany({
            where: {
                userId,
                OR: [
                    { expiresAt: { lt: now } },
                    { createdAt: { lt: new Date(now.getTime() - 365 * 86_400_000) } },
                ],
            },
        });
        const overflow = await tx.notification.findMany({
            where: { userId },
            select: { id: true },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            skip: 500,
            take: 1_000,
        });
        if (overflow.length) {
            await tx.notification.deleteMany({ where: { id: { in: overflow.map((row) => row.id) } } });
        }
    });
}
