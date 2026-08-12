import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin } from "@/lib/current-user";

export async function GET() {
  try {
    await requireAdmin();
  } catch (error) {
    const status = (error as { status?: number }).status === 401 ? 401 : 403;
    return new NextResponse(status === 401 ? "Unauthorized" : "Forbidden", {
      status,
      headers: { "Cache-Control": "private, no-store" },
    });
  }

  const users = await prisma.user.findMany({
    select: {
      userId: true,
      name: true,
      email: true,
      role: true,
      studentId: true,
      gisu: true,
      banExpiresAt: true,
      isOnboarded: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const payload = {
    type: "gshs-users-backup",
    version: 2,
    exportedAt: new Date().toISOString(),
    count: users.length,
    users,
  };

  const body = JSON.stringify(payload, null, 2);
  const filename = `users-backup-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;

  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename=\"${filename}\"`,
      "Cache-Control": "private, no-store",
    },
  });
}
