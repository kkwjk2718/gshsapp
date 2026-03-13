"use server"

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getCurrentUser } from "@/lib/session";
import { createNotification } from "@/lib/notifications";

export async function importUsersBackup(_: any, formData: FormData) {
    const sessionUser = await getCurrentUser();
    if (sessionUser?.role !== 'ADMIN') {
        return { error: 'Permission denied.' };
    }

    const confirmText = String(formData.get('confirmText') || '').trim();
    if (confirmText !== '예') {
        return { error: "복원 확인을 위해 '예'를 입력하세요." };
    }

    const f = formData.get('file');
    if (!(f instanceof File)) {
        return { error: '파일을 선택하세요.' };
    }

    try {
        const raw = await f.text();
        const parsed = JSON.parse(raw);
        if (parsed?.type !== 'gshs-users-backup' || !Array.isArray(parsed?.users)) {
            return { error: '올바른 사용자 백업 파일이 아닙니다.' };
        }

        // 1) 파일 내부 중복 제거 (userId 기준)
        const deduped = new Map<string, any>();
        let invalidCount = 0;
        for (const u of parsed.users) {
            if (!u?.userId || !u?.passwordHash || !u?.name || !u?.role) {
                invalidCount += 1;
                continue;
            }
            deduped.set(String(u.userId), u); // 같은 userId가 여러 번 있으면 마지막 항목으로 덮어씀
        }

        const users = Array.from(deduped.values());
        const existing = await prisma.user.findMany({
            where: { userId: { in: users.map((u) => String(u.userId)) } },
            select: {
                userId: true,
                passwordHash: true,
                name: true,
                email: true,
                role: true,
                studentId: true,
                gisu: true,
                banExpiresAt: true,
                isOnboarded: true,
            }
        });
        const existingMap = new Map(existing.map((u) => [u.userId, u]));

        let inserted = 0;
        let updated = 0;
        let skippedSame = 0;

        for (const u of users) {
            const payload = {
                passwordHash: u.passwordHash,
                name: u.name,
                email: u.email ?? null,
                role: u.role,
                studentId: u.studentId ?? null,
                gisu: u.gisu ?? null,
                banExpiresAt: u.banExpiresAt ? new Date(u.banExpiresAt) : null,
                isOnboarded: !!u.isOnboarded,
            };

            const ex = existingMap.get(u.userId);
            if (!ex) {
                await prisma.user.create({ data: { userId: u.userId, ...payload } });
                inserted += 1;
                continue;
            }

            const isSame =
                ex.passwordHash === payload.passwordHash &&
                ex.name === payload.name &&
                (ex.email ?? null) === payload.email &&
                ex.role === payload.role &&
                (ex.studentId ?? null) === payload.studentId &&
                (ex.gisu ?? null) === payload.gisu &&
                (ex.banExpiresAt ? ex.banExpiresAt.toISOString() : null) === (payload.banExpiresAt ? payload.banExpiresAt.toISOString() : null) &&
                ex.isOnboarded === payload.isOnboarded;

            if (isSame) {
                skippedSame += 1;
                continue;
            }

            // 2) 교집합(기존 userId 존재)은 새 데이터로 덮어씀
            await prisma.user.update({ where: { userId: u.userId }, data: payload });
            updated += 1;
        }

        revalidatePath('/admin/users');
        return {
            success: `반영 완료: 추가 ${inserted}건, 업데이트 ${updated}건, 동일 데이터 스킵 ${skippedSame}건, 무효 ${invalidCount}건`
        };
    } catch (e) {
        return { error: '복원 중 오류가 발생했습니다.' };
    }
}

export async function resetPassword(formData: FormData) {
    const sessionUser = await getCurrentUser();
    if (sessionUser?.role !== 'ADMIN') {
        return { error: 'Permission denied.' };
    }

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
    if (sessionUser?.role !== 'ADMIN' && sessionUser?.role !== 'BROADCAST') {
        return { error: 'Permission denied.' };
    }

    const userId = formData.get("userId") as string;
    const banUntilDate = formData.get("banUntil") as string;
    const reason = formData.get("reason") as string;

    if (!userId || !banUntilDate) {
        return { error: "User ID and ban date are required." };
    }

    try {
        await prisma.user.update({
            where: { id: userId },
            data: {
                banExpiresAt: new Date(banUntilDate),
            },
        });

        const message = reason
            ? `${banUntilDate}까지 계정 이용이 제한되었습니다.\n사유: ${reason}`
            : `${banUntilDate}까지 계정 이용이 제한되었습니다.`;

        await createNotification(
            userId,
            "SYSTEM",
            "계정 일시 정지 안내",
            message,
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