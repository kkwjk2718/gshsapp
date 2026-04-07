import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { MEMBER_SERVICE_SUSPENDED } from "@/lib/member-service-suspension";

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) {
    return null;
  }

  if (MEMBER_SERVICE_SUSPENDED) {
    return null;
  }

  return prisma.user.findUnique({
    where: { id: session.user.id },
    select: {
      id: true,
      userId: true,
      name: true,
      email: true,
      role: true,
      studentId: true,
      gisu: true,
      banExpiresAt: true,
      createdAt: true,
    },
  });
}
