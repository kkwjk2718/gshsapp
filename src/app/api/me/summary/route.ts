import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import {
  anonymousUserSummary,
  type UserSummaryPayload,
} from "@/lib/user-state";
import { getCurrentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const noStoreHeaders = {
  "Cache-Control": "no-store, max-age=0, must-revalidate",
};

export async function GET() {
  const user = await getCurrentUser();

  if (!user) {
    return NextResponse.json(anonymousUserSummary, { headers: noStoreHeaders });
  }

  let unreadNotificationCount = 0;

  try {
    unreadNotificationCount = await prisma.notification.count({
      where: {
        userId: user.id,
        isRead: false,
      },
    });
  } catch {
    unreadNotificationCount = 0;
  }

  const payload: UserSummaryPayload = {
    authenticated: true,
    role: user.role ?? null,
    name: user.name ?? null,
    studentId: user.studentId ?? null,
    unreadNotificationCount,
  };

  return NextResponse.json(payload, { headers: noStoreHeaders });
}
