"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { createNotification } from "@/lib/notifications";
import { revalidatePath } from "next/cache";

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
    const link = formData.get("link") as string;
    const expiresAfter = formData.get("expiresAfter") as string; // days

    if (!title || !content) {
        return { error: "제목과 내용을 입력해주세요." };
    }

    let expiresAt: Date | undefined;
    if (expiresAfter && parseInt(expiresAfter) > 0) {
        expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + parseInt(expiresAfter));
    }

    try {
        if (targetType === "ALL") {
            const allUsers = await prisma.user.findMany({ select: { id: true } });

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

            await prisma.notification.createMany({
                data: notifications
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

            await createNotification(
                targetUser.id,
                "NOTICE",
                title,
                content,
                link,
                expiresAt
            );
        }

        revalidatePath("/admin/notifications");
        return { success: "알림이 발송되었습니다." };

    } catch (error) {
        console.error("Notification send error:", error);
        return { error: "알림 발송 중 오류가 발생했습니다." };
    }
}
