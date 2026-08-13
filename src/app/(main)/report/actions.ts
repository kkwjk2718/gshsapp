"use server"

import { prisma } from "@/lib/db";
import { getCurrentUser } from "@/lib/session";
import { revalidatePath } from "next/cache";
import {
    REPORT_DAILY_CAP,
    REPORT_PENDING_CAP,
    consumeReportSubmissionQuota,
    validateReportSubmission,
} from "@/lib/security/submission-controls";
import { enforceErrorReportLifecycle } from "@/lib/submission-lifecycle";

export async function submitErrorReport(title: string, content: string) {
    const user = await getCurrentUser();
    if (!user) {
        throw new Error("User not authenticated");
    }
    const input = validateReportSubmission(title, content);
    consumeReportSubmissionQuota(user.id);

    const report = await prisma.$transaction(async (tx) => {
        await enforceErrorReportLifecycle(tx);
        const since = new Date(Date.now() - 86_400_000);
        const [dailyCount, pendingCount] = await Promise.all([
            tx.errorReport.count({ where: { userId: user.id, createdAt: { gte: since } } }),
            tx.errorReport.count({ where: { userId: user.id, status: { in: ["PENDING", "REVIEWING"] } } }),
        ]);
        if (dailyCount >= REPORT_DAILY_CAP || pendingCount >= REPORT_PENDING_CAP) {
            throw new Error("Report submission quota exceeded");
        }
        return tx.errorReport.create({ data: { ...input, userId: user.id } });
    });

    revalidatePath("/report");
    return { success: true, id: report.id };
}
