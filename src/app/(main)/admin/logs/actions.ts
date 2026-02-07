"use server"

import { prisma } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/session";
import { format } from "date-fns";

// 1. 설정 가져오기
export async function getLogSettings() {
    const setting = await prisma.systemSetting.findUnique({
        where: { key: 'LOG_RETENTION_DAYS' }
    });
    return parseInt(setting?.value || "30");
}

// 2. 설정 저장 및 정리
export async function saveRetentionSettings(days: number) {
    const user = await getCurrentUser();
    if (user?.role !== 'ADMIN') throw new Error("Unauthorized");

    await prisma.systemSetting.upsert({
        where: { key: 'LOG_RETENTION_DAYS' },
        update: { value: days.toString() },
        create: { key: 'LOG_RETENTION_DAYS', value: days.toString(), description: "System log retention period in days" }
    });

    // 정리 작업 수행
    await cleanupLogs();

    revalidatePath("/admin/logs");
}

// 3. 로그 정리 (오래된 로그 삭제)
export async function cleanupLogs() {
    const days = await getLogSettings();
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - days);

    const result = await prisma.systemLog.deleteMany({
        where: {
            createdAt: { lt: cutoffDate }
        }
    });

    return result.count;
}

// 4. 로그 데이터 가져오기 (CSV용)
export async function getLogsForExport() {
    const user = await getCurrentUser();
    if (user?.role !== 'ADMIN') throw new Error("Unauthorized");

    // 최신순 10,000개
    const logs = await prisma.systemLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 10000,
        include: { user: { select: { name: true, studentId: true } } }
    });

    const header = "Time,Action,User,StudentId,IP,Path,Details\n";
    const rows = logs.map(log => {
        const time = format(log.createdAt, "yyyy-MM-dd HH:mm:ss");
        const userName = log.user?.name || "Guest";
        const studentId = log.user?.studentId || "-";
        const details = (log.details || "").replace(/"/g, '""').replace(/\n/g, ' '); // 줄바꿈 제거

        return `"${time}","${log.action}","${userName}","${studentId}","${log.ip}","${log.path || ''}","${details}"`;
    }).join("\n");

    return header + rows;
}

// 5. 통계
export async function getLogStats() {
    const totalCount = await prisma.systemLog.count();
    const todayCount = await prisma.systemLog.count({
        where: { createdAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } }
    });
    return { totalCount, todayCount };
}

// 6. 로그 뷰어용 데이터 조회 (페이지네이션)
export async function getSystemLogs(
    page: number = 1,
    limit: number = 20,
    type?: string,
    searchUser?: string,
    role?: string
) {
    const user = await getCurrentUser();
    if (user?.role !== 'ADMIN') throw new Error("Unauthorized");

    const skip = (page - 1) * limit;

    // 조건 설정
    const where: any = {};

    // 1. Action Type Filter
    if (type && type !== 'ALL') {
        where.action = type;
    }

    // 2. User Search Filter (Name or StudentID)
    if (searchUser) {
        where.user = {
            OR: [
                { name: { contains: searchUser } },
                { studentId: { contains: searchUser } },
                { userId: { contains: searchUser } } // Also searchable by login ID
            ]
        };
    }

    // 3. User Role Filter
    if (role && role !== 'ALL') {
        // If user search filter already exists, we need to merge logic
        // prisma filter merging is implicit with object properties.
        // where.user already exists if searchUser is present.

        if (where.user) {
            // If existing user filter (from search), add role condition to it
            where.user = {
                AND: [
                    where.user, // The OR condition from search
                    { role: role }
                ]
            };
        } else {
            where.user = { role: role };
        }
    }

    const [logs, total] = await Promise.all([
        prisma.systemLog.findMany({
            where,
            orderBy: { createdAt: 'desc' },
            skip,
            take: limit,
            include: {
                user: { select: { name: true, studentId: true, role: true, userId: true } }
            }
        }),
        prisma.systemLog.count({ where })
    ]);

    return {
        logs,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page
    };
}
