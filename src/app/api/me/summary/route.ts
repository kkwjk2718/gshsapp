import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import {
  anonymousUserSummary,
  type UserSummaryPayload,
} from "@/lib/user-state";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
};

export async function GET() {
  const session = await auth();

  if (!session?.user) {
    return NextResponse.json(anonymousUserSummary, { headers: noStoreHeaders });
  }

  let unreadNotificationCount = 0;

  try {
    unreadNotificationCount = await prisma.notification.count({
      where: {
        userId: session.user.id,
        isRead: false,
      },
    });
  } catch {
    unreadNotificationCount = 0;
  }

  const payload: UserSummaryPayload = {
    authenticated: true,
    role: session.user.role ?? null,
    name: session.user.name ?? null,
    studentId: session.user.studentId ?? null,
    unreadNotificationCount,
  };

  return NextResponse.json(payload, { headers: noStoreHeaders });
}
