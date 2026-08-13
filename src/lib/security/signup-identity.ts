import { InviteRedemptionError } from "@/lib/invite-redemption";
import { isValidStudentId } from "@/lib/student-id";
import { isUserRole } from "@/lib/user-roles";

export function validateSignupInviteIdentity(invite: Readonly<{ targetRole: string }>, studentId: string | null): void {
  if (!isUserRole(invite.targetRole)) throw new InviteRedemptionError("INVALID_ROLE_DATA");
  if (invite.targetRole === "STUDENT") {
    if (!studentId || !isValidStudentId(studentId)) throw new InviteRedemptionError("INVALID_ROLE_DATA");
    return;
  }
  if (studentId) throw new InviteRedemptionError("INVALID_ROLE_DATA");
}
