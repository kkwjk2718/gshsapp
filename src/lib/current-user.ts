import "server-only";

import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { MEMBER_SERVICE_SUSPENDED } from "@/lib/member-service-suspension";
import { hasActiveRosterMembership, isRosterGovernedRole } from "@/lib/student-membership";

const currentUserSelect = {
  id: true,
  userId: true,
  name: true,
  email: true,
  role: true,
  studentId: true,
  gisu: true,
  banExpiresAt: true,
  createdAt: true,
  sessionVersion: true,
  mustChangePassword: true,
} as const;

export class AuthorizationError extends Error {
  constructor(message: "Unauthorized" | "Forbidden", readonly status: 401 | 403) {
    super(message);
    this.name = "AuthorizationError";
  }
}

export async function getCurrentUser(options: Readonly<{ allowPasswordChangeRequired?: boolean }> = {}) {
  const session = await auth();
  const subject = session?.user?.id;
  const sessionVersion = session?.user?.sessionVersion;

  if (MEMBER_SERVICE_SUSPENDED || !subject || !Number.isInteger(sessionVersion)) return null;

  const user = await prisma.user.findUnique({
    where: { id: subject },
    select: currentUserSelect,
  });

  if (!user || user.sessionVersion !== sessionVersion) return null;
  if (isRosterGovernedRole(user.role) && !(await hasActiveRosterMembership(prisma, user))) return null;
  if (user.mustChangePassword && !options.allowPasswordChangeRequired) return null;
  return user;
}

export async function requireCurrentUser() {
  const user = await getCurrentUser();
  if (!user) throw new AuthorizationError("Unauthorized", 401);
  return user;
}

export async function requireAdmin() {
  const user = await requireCurrentUser();
  if (user.role !== "ADMIN") throw new AuthorizationError("Forbidden", 403);
  return user;
}
