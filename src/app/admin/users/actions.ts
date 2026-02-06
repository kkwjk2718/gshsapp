"use server"

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getCurrentUser } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

export async function resetPassword(formData: FormData) {
    const userId = formData.get("userId") as string;

    // Simple validation
    if (!userId) return { error: "User ID is required." };

    try {
        const newPassword = Math.random().toString(36).slice(-8);
        const passwordHash = await bcrypt.hash(newPassword, 10);

        await prisma.user.update({
            where: { id: userId },
            data: { passwordHash },
        });

        revalidatePath("/admin/users");
        return { success: `Password reset successfully. New password is: ${newPassword}` };
    } catch (error) {
        return { error: "Failed to reset password." };
    }
}

export async function banUser(formData: FormData) {
    const sessionUser = await getCurrentUser();
    if (sessionUser?.role !== 'ADMIN') {
        return { error: 'Permission denied.' };
    }

    const userId = formData.get("userId") as string;
    const banUntilDate = formData.get("banUntil") as string;

    if (!userId || !banUntilDate) {
        return { error: "User ID and ban date are required." };
    }

    try {


        // ... inside banUser
        await prisma.user.update({
            where: { id: userId },
            data: {
                banExpiresAt: new Date(banUntilDate),
            },
        });

        await createNotification(
            userId,
            "SYSTEM",
            "계정 일시 정지 안내",
            `${banUntilDate}까지 계정 이용이 제한되었습니다.`,
            "/privacy"
        );

        revalidatePath("/admin/users");
        return { success: "User has been banned." };
    } catch (e) {
        return { error: "Failed to ban user." };
    }
}

export async function unbanUser(formData: FormData) {
    const sessionUser = await getCurrentUser();
    if (sessionUser?.role !== 'ADMIN') {
        return { error: 'Permission denied.' };
    }

    const userId = formData.get("userId") as string;

    if (!userId) {
        return { error: "User ID is required." };
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                banExpiresAt: null,
            },
        });

        await createNotification(
            userId,
            "SYSTEM",
            "계정 정지 해제 안내",
            "계정 이용 제한이 해제되었습니다. 다시 서비스를 이용하실 수 있습니다.",
            "/"
        );

        revalidatePath("/admin/users");
        return { success: "User has been unbanned." };
    } catch (e) {
        return { error: "Failed to unban user." };
    }
}