"use server"

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { getCurrentUser } from "@/lib/session";
import { createNotification } from "@/lib/notifications";
import { getGradeMapping } from "@/lib/grade-utils";
import { logAction } from "@/lib/logger";
import { resolveUserRoleChange, UserRoleChangeError, isUserRole } from "@/lib/user-role-change";
import { canChangeGisu } from "@/lib/user-roles";

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

export type ChangeUserRoleResult = {
    success?: string;
    error?: string;
};

export type ChangeUserGisuResult = {
    success?: string;
    error?: string;
};

export type DeleteUserResult = {
    success?: string;
    error?: string;
};

function revalidateUserManagementPaths() {
    revalidatePath("/admin/users");
    revalidatePath("/admin/logs");
    revalidatePath("/admin/reports");
    revalidatePath("/admin/notices");
    revalidatePath("/admin/songs");
    revalidatePath("/notices");
    revalidatePath("/calendar");
    revalidatePath("/songs");
}

function getRoleChangeErrorMessage(error: unknown) {
    if (error instanceof UserRoleChangeError) {
        if (error.code === "STUDENT_ID_REQUIRED") {
            return "학생 권한으로 변경하려면 4자리 학생번호를 입력하세요.";
        }

        if (error.code === "INVALID_STUDENT_ID") {
            return "학생번호 형식이 올바르지 않습니다.";
        }

        if (error.code === "GRADE_MAPPING_MISSING") {
            return "학년-기수 매핑을 찾을 수 없습니다. 설정을 확인하세요.";
        }
    }

    if (error instanceof Error) {
        if (error.message === "TARGET_USER_NOT_FOUND") {
            return "대상 사용자를 찾을 수 없습니다.";
        }

        if (error.message === "ROLE_UNCHANGED") {
            return "현재와 같은 권한으로는 변경할 수 없습니다.";
        }

        if (error.message === "SELF_ADMIN_PROTECTED") {
            return "현재 로그인한 관리자 계정의 ADMIN 권한은 해제할 수 없습니다.";
        }

        if (error.message === "LAST_ADMIN_PROTECTED") {
            return "마지막 관리자 계정은 다른 권한으로 변경할 수 없습니다.";
        }
    }

    return "권한 변경 중 오류가 발생했습니다.";
}

export async function changeUserRole(formData: FormData): Promise<ChangeUserRoleResult> {
    const sessionUser = await getCurrentUser();
    if (!sessionUser?.id || sessionUser.role !== "ADMIN") {
        return { error: "Permission denied." };
    }

    const userId = String(formData.get("userId") || "").trim();
    const targetRole = String(formData.get("targetRole") || "").trim();
    const studentIdInput = String(formData.get("studentId") || "").trim();

    if (!userId) {
        return { error: "대상 사용자를 찾을 수 없습니다." };
    }

    if (!isUserRole(targetRole)) {
        return { error: "변경할 권한이 올바르지 않습니다." };
    }

    try {
        const gradeMapping = targetRole === "STUDENT" ? await getGradeMapping() : undefined;

        const result = await prisma.$transaction(async (tx) => {
            const targetUser = await tx.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    userId: true,
                    name: true,
                    role: true,
                    studentId: true,
                    gisu: true,
                },
            });

            if (!targetUser) {
                throw new Error("TARGET_USER_NOT_FOUND");
            }

            if (targetUser.role === targetRole) {
                throw new Error("ROLE_UNCHANGED");
            }

            if (targetUser.id === sessionUser.id && targetUser.role === "ADMIN" && targetRole !== "ADMIN") {
                throw new Error("SELF_ADMIN_PROTECTED");
            }

            if (targetUser.role === "ADMIN" && targetRole !== "ADMIN") {
                const adminCount = await tx.user.count({
                    where: { role: "ADMIN" },
                });

                if (adminCount <= 1) {
                    throw new Error("LAST_ADMIN_PROTECTED");
                }
            }

            const nextRole = resolveUserRoleChange({
                currentStudentId: targetUser.studentId,
                currentGisu: targetUser.gisu,
                targetRole,
                studentIdInput,
                gradeMapping,
            });

            const updatedUser = await tx.user.update({
                where: { id: userId },
                data: {
                    role: nextRole.role,
                    studentId: nextRole.studentId,
                    gisu: nextRole.gisu,
                },
                select: {
                    id: true,
                    userId: true,
                    name: true,
                    role: true,
                    studentId: true,
                    gisu: true,
                },
            });

            return {
                before: targetUser,
                after: updatedUser,
            };
        });

        revalidatePath("/admin/users");

        await logAction("user_role_changed", {
            actorUserId: sessionUser.id,
            targetUserId: result.before.id,
            targetLoginId: result.before.userId,
            fromRole: result.before.role,
            toRole: result.after.role,
            previousStudentId: result.before.studentId,
            nextStudentId: result.after.studentId,
            previousGisu: result.before.gisu,
            nextGisu: result.after.gisu,
        });

        return {
            success: `${result.before.name}님의 권한이 ${result.before.role}에서 ${result.after.role}(으)로 변경되었습니다.`,
        };
    } catch (error) {
        await logAction("user_role_change_failed", {
            actorUserId: sessionUser.id,
            targetUserId: userId,
            targetRole,
            reason: error instanceof Error ? error.message : "UNKNOWN",
        });

        return { error: getRoleChangeErrorMessage(error) };
    }
}

function getGisuChangeErrorMessage(error: unknown) {
    if (error instanceof Error) {
        if (error.message === "TARGET_USER_NOT_FOUND") {
            return "대상 사용자를 찾을 수 없습니다.";
        }

        if (error.message === "GISU_REQUIRED") {
            return "변경할 기수를 입력하세요.";
        }

        if (error.message === "GISU_INVALID") {
            return "기수는 1 이상의 정수여야 합니다.";
        }

        if (error.message === "GISU_ROLE_NOT_SUPPORTED") {
            return "현재 역할에서는 기수를 직접 변경할 수 없습니다.";
        }

        if (error.message === "GISU_UNCHANGED") {
            return "현재와 같은 기수로는 변경할 수 없습니다.";
        }
    }

    return "기수 변경 중 오류가 발생했습니다.";
}

export async function changeUserGisu(formData: FormData): Promise<ChangeUserGisuResult> {
    const sessionUser = await getCurrentUser();
    if (!sessionUser?.id || sessionUser.role !== "ADMIN") {
        return { error: "Permission denied." };
    }

    const userId = String(formData.get("userId") || "").trim();
    const nextGisuRaw = String(formData.get("gisu") || "").trim();

    if (!userId) {
        return { error: "대상 사용자를 찾을 수 없습니다." };
    }

    try {
        const nextGisu = Number(nextGisuRaw);
        if (!nextGisuRaw) {
            throw new Error("GISU_REQUIRED");
        }

        if (!Number.isInteger(nextGisu) || nextGisu <= 0) {
            throw new Error("GISU_INVALID");
        }

        const result = await prisma.$transaction(async (tx) => {
            const targetUser = await tx.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    userId: true,
                    name: true,
                    role: true,
                    gisu: true,
                    studentId: true,
                },
            });

            if (!targetUser) {
                throw new Error("TARGET_USER_NOT_FOUND");
            }

            if (!canChangeGisu(targetUser.role)) {
                throw new Error("GISU_ROLE_NOT_SUPPORTED");
            }

            if (targetUser.gisu === nextGisu) {
                throw new Error("GISU_UNCHANGED");
            }

            const updatedUser = await tx.user.update({
                where: { id: targetUser.id },
                data: { gisu: nextGisu },
                select: {
                    id: true,
                    userId: true,
                    name: true,
                    role: true,
                    gisu: true,
                },
            });

            return { before: targetUser, after: updatedUser };
        });

        revalidateUserManagementPaths();

        await logAction("user_gisu_changed", {
            actorUserId: sessionUser.id,
            targetUserId: result.before.id,
            targetLoginId: result.before.userId,
            targetRole: result.before.role,
            previousGisu: result.before.gisu,
            nextGisu: result.after.gisu,
        });

        return {
            success: `${result.before.name}님의 기수가 ${result.before.gisu ?? "미설정"}에서 ${result.after.gisu ?? "미설정"}(으)로 변경되었습니다.`,
        };
    } catch (error) {
        await logAction("user_gisu_change_failed", {
            actorUserId: sessionUser.id,
            targetUserId: userId,
            requestedGisu: nextGisuRaw,
            reason: error instanceof Error ? error.message : "UNKNOWN",
        });

        return { error: getGisuChangeErrorMessage(error) };
    }
}

function getDeleteUserErrorMessage(error: unknown) {
    if (error instanceof Error) {
        if (error.message === "TARGET_USER_NOT_FOUND") {
            return "대상 사용자를 찾을 수 없습니다.";
        }

        if (error.message === "DELETE_CONFIRM_MISMATCH") {
            return "삭제 확인용 로그인 ID가 일치하지 않습니다.";
        }

        if (error.message === "SELF_DELETE_PROTECTED") {
            return "현재 로그인한 관리자 계정은 삭제할 수 없습니다.";
        }

        if (error.message === "LAST_ADMIN_PROTECTED") {
            return "마지막 관리자 계정은 삭제할 수 없습니다.";
        }
    }

    return "사용자 삭제 중 오류가 발생했습니다.";
}

export async function deleteUserAccount(formData: FormData): Promise<DeleteUserResult> {
    const sessionUser = await getCurrentUser();
    if (!sessionUser?.id || sessionUser.role !== "ADMIN") {
        return { error: "Permission denied." };
    }

    const userId = String(formData.get("userId") || "").trim();
    const confirmLoginId = String(formData.get("confirmLoginId") || "").trim();

    if (!userId) {
        return { error: "대상 사용자를 찾을 수 없습니다." };
    }

    try {
        const result = await prisma.$transaction(async (tx) => {
            const targetUser = await tx.user.findUnique({
                where: { id: userId },
                select: {
                    id: true,
                    userId: true,
                    name: true,
                    role: true,
                },
            });

            if (!targetUser) {
                throw new Error("TARGET_USER_NOT_FOUND");
            }

            if (targetUser.userId !== confirmLoginId) {
                throw new Error("DELETE_CONFIRM_MISMATCH");
            }

            if (targetUser.id === sessionUser.id) {
                throw new Error("SELF_DELETE_PROTECTED");
            }

            if (targetUser.role === "ADMIN") {
                const adminCount = await tx.user.count({
                    where: { role: "ADMIN" },
                });

                if (adminCount <= 1) {
                    throw new Error("LAST_ADMIN_PROTECTED");
                }
            }

            const [noticeCount, scheduleCount, songRequestCount, personalEventCount, notificationCount, errorReportCount, auditLogCount, systemLogCount] = await Promise.all([
                tx.notice.count({ where: { writerId: targetUser.id } }),
                tx.schedule.count({ where: { writerId: targetUser.id } }),
                tx.songRequest.count({ where: { requesterId: targetUser.id } }),
                tx.personalEvent.count({ where: { userId: targetUser.id } }),
                tx.notification.count({ where: { userId: targetUser.id } }),
                tx.errorReport.count({ where: { userId: targetUser.id } }),
                tx.auditLog.count({ where: { actorId: targetUser.id } }),
                tx.systemLog.count({ where: { userId: targetUser.id } }),
            ]);

            await tx.systemLog.updateMany({
                where: { userId: targetUser.id },
                data: { userId: null },
            });

            await tx.inviteToken.updateMany({
                where: { usedByUserId: targetUser.id },
                data: { usedByUserId: null },
            });

            await tx.notification.deleteMany({ where: { userId: targetUser.id } });
            await tx.personalEvent.deleteMany({ where: { userId: targetUser.id } });
            await tx.teacherProfile.deleteMany({ where: { userId: targetUser.id } });
            await tx.auditLog.deleteMany({ where: { actorId: targetUser.id } });
            await tx.errorReport.deleteMany({ where: { userId: targetUser.id } });
            await tx.songRequest.deleteMany({ where: { requesterId: targetUser.id } });
            await tx.notice.deleteMany({ where: { writerId: targetUser.id } });
            await tx.schedule.deleteMany({ where: { writerId: targetUser.id } });
            await tx.user.delete({ where: { id: targetUser.id } });

            return {
                targetUser,
                deletedCounts: {
                    notices: noticeCount,
                    schedules: scheduleCount,
                    songRequests: songRequestCount,
                    personalEvents: personalEventCount,
                    notifications: notificationCount,
                    errorReports: errorReportCount,
                    auditLogs: auditLogCount,
                    systemLogsDetached: systemLogCount,
                },
            };
        });

        revalidateUserManagementPaths();

        await logAction("user_deleted", {
            actorUserId: sessionUser.id,
            targetUserId: result.targetUser.id,
            targetLoginId: result.targetUser.userId,
            targetRole: result.targetUser.role,
            deletedCounts: result.deletedCounts,
        });

        return {
            success: `${result.targetUser.name}(${result.targetUser.userId}) 계정을 삭제했습니다.`,
        };
    } catch (error) {
        await logAction("user_delete_failed", {
            actorUserId: sessionUser.id,
            targetUserId: userId,
            confirmLoginId,
            reason: error instanceof Error ? error.message : "UNKNOWN",
        });

        return { error: getDeleteUserErrorMessage(error) };
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
