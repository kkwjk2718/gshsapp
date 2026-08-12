"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import { writeAuditLog } from "@/lib/audit";

export async function getErrorReports(
    page: number = 1,
    limit: number = 20,
    status?: string
) {
    const user = await getCurrentUser();
    if (user?.role !== "ADMIN") {
        throw new Error("Unauthorized");
    }
    if (!Number.isInteger(page) || page < 1 || page > 10_000 || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
        (status && !["ALL", "PENDING", "REVIEWING", "RESOLVED"].includes(status))) {
        throw new Error("Invalid report query");
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
    const notes = adminNotes?.trim();
    if (!id || new TextEncoder().encode(id).byteLength > 128 || !["PENDING", "REVIEWING", "RESOLVED"].includes(status) ||
        (notes !== undefined && ([...notes].length > 2_000 || new TextEncoder().encode(notes).byteLength > 4_096))) {
        throw new Error("Invalid report update");
    }

    await prisma.$transaction(async (tx) => {
        const allowedCurrentStatuses = status === "PENDING" ? ["REVIEWING"] : ["PENDING", "REVIEWING"];
        const result = await tx.errorReport.updateMany({
            where: { id, status: { in: allowedCurrentStatuses } },
            data: {
                status,
                adminNotes: notes,
                resolvedAt: status === "RESOLVED" ? new Date() : null,
            },
        });
        if (result.count !== 1) throw new Error("Report status changed concurrently");
        await writeAuditLog(tx, {
            actorId: user.id,
            action: "REPORT_STATUS_CHANGED",
            target: { type: "ERROR_REPORT", id },
        });
    });

    revalidatePath("/admin/reports");
    return { success: true };
}
