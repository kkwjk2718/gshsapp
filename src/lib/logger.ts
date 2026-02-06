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
    const ip = headersList.get("x-forwarded-for") || "unknown";
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
  } catch (error) {
    console.error("Failed to log action:", error);
    // 로깅 실패가 메인 기능을 중단시키지 않도록 예외를 억제합니다.
  }
}
