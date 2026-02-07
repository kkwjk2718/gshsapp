import { prisma } from "@/lib/db";
import { auth } from "@/auth";
import { headers } from "next/headers";

export async function logAction(
  action: string,
  details?: Record<string, any> | string,
  path?: string
) {
  try {
    const session = await auth();
    const headersList = await headers();

    // 로컬 개발 환경에서는 ::1 등이 나올 수 있음
    // Nginx 환경에서는 X-Forwarded-For가 콤마로 구분된 리스트일 수 있음 (Client, Proxy1, Proxy2)
    // 따라서 첫 번째 IP를 가져오거나 X-Real-IP를 우선적으로 사용
    const forwardedFor = headersList.get("x-forwarded-for");
    const realIp = headersList.get("x-real-ip");

    // X-Real-IP가 있으면 그걸 쓰고, 없으면 X-Forwarded-For의 첫 번째 IP 사용
    const ip = realIp || (forwardedFor ? forwardedFor.split(',')[0].trim() : "unknown");
    const userAgent = headersList.get("user-agent") || "unknown";

    const detailsString = typeof details === 'object' ? JSON.stringify(details) : details;

    await prisma.systemLog.create({
      data: {
        action,
        userId: session?.user?.id,
        ip,
        userAgent,
        path: path || headersList.get("referer"),
        details: detailsString,
      },
    });
  } catch (error: any) {
    // Foreign key constraint failed (e.g., user deleted but session exists)
    if (error.code === 'P2003') {
      try {
        const headersList = await headers();
        const ip = headersList.get("x-forwarded-for") || "unknown";
        const userAgent = headersList.get("user-agent") || "unknown";
        const detailsString = typeof details === 'object' ? JSON.stringify(details) : details;

        await prisma.systemLog.create({
          data: {
            action,
            userId: null, // Fallback to anonymous
            ip,
            userAgent,
            path: path || headersList.get("referer"),
            details: detailsString ? `${detailsString} (Original UserID Invalid)` : "(Original UserID Invalid)",
          },
        });
      } catch (retryError) {
        console.error("Failed to log action (retry):", retryError);
      }
    } else {
      console.error("Failed to log action:", error);
    }
  }
}
