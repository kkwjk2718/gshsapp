import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function GET() {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const users = await prisma.user.findMany({
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
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const payload = {
    type: "gshs-users-backup",
    version: 1,
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
    },
  });
}
