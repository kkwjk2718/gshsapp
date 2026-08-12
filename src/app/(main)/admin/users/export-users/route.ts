import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { AuthorizationError, requireAdmin } from "@/lib/current-user";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    await requireAdmin();

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
        ...PRIVATE_NO_STORE,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return new NextResponse("Forbidden", { status: 403, headers: PRIVATE_NO_STORE });
    }
    return new NextResponse("Internal Server Error", { status: 500, headers: PRIVATE_NO_STORE });
  }
}
