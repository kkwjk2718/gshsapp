"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";

export async function getErrorReports(
    page: number = 1,
    limit: number = 20,
    status?: string
) {
    const user = await getCurrentUser();
    if (user?.role !== "ADMIN") {
        throw new Error("Unauthorized");
    }

    const skip = (page - 1) * limit;
    const where: any = {};

    if (status && status !== "ALL") {
        where.status = status;
    }

    const [reports, total] = await Promise.all([
        prisma.errorReport.findMany({
            where,
            orderBy: { createdAt: "desc" },
            skip,
            take: limit,
            include: {
                user: {
                    select: {
                        name: true,
                        studentId: true,
                        userId: true,
                        role: true,
                    }
                }
            }
        }),
        prisma.errorReport.count({ where })
    ]);

    return {
        reports,
        total,
        totalPages: Math.ceil(total / limit),
        currentPage: page,
    };
}

export async function updateReportStatus(
    id: string,
    status: string,
    adminNotes?: string
) {
    const user = await getCurrentUser();
    if (user?.role !== "ADMIN") {
        throw new Error("Unauthorized");
    }

    await prisma.errorReport.update({
        where: { id },
        data: {
            status,
            adminNotes,
            resolvedAt: status === "RESOLVED" ? new Date() : null,
        }
    });

    revalidatePath("/admin/reports");
    return { success: true };
}
