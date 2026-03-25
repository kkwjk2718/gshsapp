import { auth } from "@/auth";
import { prisma } from "@/lib/db";

export async function getCurrentUser() {
  const session = await auth();
  if (!session?.user?.id) {
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
