"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";
import { normalizeNotificationLink } from "@/lib/security/public-input";

export async function sendAdminNotification(formData: FormData) {
    const user = await getCurrentUser();

    // Server-side check for admin role
    if (!user || user.role !== "ADMIN") {
        return { error: "권한이 없습니다." };
    }

    const targetType = formData.get("targetType") as string; // 'ALL' or 'USER'
    const targetUserId = formData.get("targetUserId") as string;
    const title = formData.get("title") as string;
    const content = formData.get("content") as string;
    const rawLink = formData.get("link");
    const expiresAfter = formData.get("expiresAfter") as string; // days

    const titleBytes = new TextEncoder().encode(title || "").byteLength;
    const contentBytes = new TextEncoder().encode(content || "").byteLength;
    const linkValue = typeof rawLink === "string" ? rawLink : "";
    const linkBytes = new TextEncoder().encode(linkValue).byteLength;
    if (!title || !content || !["ALL", "USER"].includes(targetType) || [...title].length > 120 || titleBytes > 240 ||
        [...content].length > 2_000 || contentBytes > 4_000 || [...linkValue].length > 512 || linkBytes > 1_024) {
        return { error: "제목과 내용을 입력해주세요." };
    }

    const link = normalizeNotificationLink(linkValue);
    if (linkValue.trim() && !link) {
        return { error: "Notification links must be local application paths." };
    }

    let expiresAt: Date | undefined;
    const expiryDays = expiresAfter ? Number(expiresAfter) : 0;
    if (expiresAfter && (!Number.isInteger(expiryDays) || expiryDays < 1 || expiryDays > 365)) {
        return { error: "Invalid notification expiration." };
    }
    if (expiryDays > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + expiryDays);
    }

    try {
        if (targetType === "ALL") {
            const allUsers = await prisma.user.findMany({ select: { id: true }, take: 5_001 });
            if (allUsers.length > 5_000) return { error: "Notification audience exceeds the 5,000-user safety limit." };

            // Batch create is more efficient using prisma.notification.createMany
            // But createNotification helper is singular. 
            // For now, let's use createMany directly here for performance
            const notifications = allUsers.map(u => ({
                userId: u.id,
                type: "NOTICE",
                title,
                content,
                link: link || null,
                // @ts-ignore
                expiresAt: expiresAt || null,
                isRead: false
            }));

            await prisma.$transaction(async (tx) => {
              await tx.notification.createMany({ data: notifications });
              await writeAuditLog(tx, {
                actorId: user.id,
                action: "ADMIN_NOTIFICATION_SENT",
                target: { type: "NOTIFICATION", id: "ALL" },
              });
            });

        } else {
            if (!targetUserId) {
                return { error: "대상 사용자 ID를 입력해주세요." };
            }

            // Check if user exists by verifying their internal ID or login ID?
            // Usually admins know the login UserId. Let's find internal ID first.
            const targetUser = await prisma.user.findUnique({
                where: { userId: targetUserId }
            });

            if (!targetUser) {
                return { error: "존재하지 않는 사용자 ID입니다." };
            }

            await prisma.$transaction(async (tx) => {
              await tx.notification.create({
                data: {
                  userId: targetUser.id,
                  type: "NOTICE",
                  title,
                  content,
                  link,
                  expiresAt: expiresAt ?? null,
                  isRead: false,
                },
              });
              await writeAuditLog(tx, {
                actorId: user.id,
                action: "ADMIN_NOTIFICATION_SENT",
                target: { type: "NOTIFICATION", id: targetUser.id },
              });
            });
        }

        revalidatePath("/admin/notifications");
        return { success: "알림이 발송되었습니다." };

    } catch (error) {
        console.error("Notification send error:", error);
        return { error: "알림 발송 중 오류가 발생했습니다." };
    }
}
