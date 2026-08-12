import { prisma } from "@/lib/db";
import { DistributionReservationError, reserveDistribution } from "@/lib/distribution-reservation";
import { logAction } from "@/lib/logger";
import { getApplicationSecuritySecret, hashSecurityPrincipal } from "@/lib/security/principal-key";
import {
  getDistributionQuotaSummary,
  recordBlockedTokenDistribution,
  resolveStudentTargetGisu,
  sendInviteTokenEmail,
} from "@/lib/token-distribution";
import {
  getPortalClientKey,
  getPortalCooldownRemainingSeconds,
  setPortalCooldownCookie,
} from "@/lib/token-portal-session";
import { isValidStudentId } from "@/lib/student-id";
import { getTokenPortalSettings } from "@/lib/system-settings";

export async function getPublicPortalState() {
  const settings = await getTokenPortalSettings();
  const cooldownSeconds = await getPortalCooldownRemainingSeconds();
  const quota = await getDistributionQuotaSummary();
  return { settings, cooldownSeconds, quota };
}

export async function sendPortalStudentInvite({ name, studentId, email }: {
  name: string;
  studentId: string;
  email: string;
}) {
  const portalState = await getPublicPortalState();
  const rawClientKey = await getPortalClientKey();
  const clientKey = hashSecurityPrincipal("portal-client", rawClientKey, getApplicationSecuritySecret());
  const normalizedName = name.trim().normalize("NFC");
  const normalizedEmail = email.trim().toLowerCase();
  const normalizedStudentId = studentId.trim();

  if (!portalState.settings.enabled) {
    await recordBlockedTokenDistribution({
      source: "PORTAL_AUTO", recipientEmail: normalizedEmail, requesterName: normalizedName,
      studentId: normalizedStudentId, targetRole: "STUDENT", errorMessage: "Portal disabled.",
      clientKey, createdBy: "system:distribution-portal",
    });
    await logAction("token_portal_blocked", { reason: "disabled" });
    return { error: "The token distribution portal is disabled." };
  }

  if (!normalizedName || [...normalizedName].length > 80 || new TextEncoder().encode(normalizedName).byteLength > 240 ||
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(normalizedEmail) || normalizedEmail.length > 254 ||
      !isValidStudentId(normalizedStudentId)) {
    return { error: "Please check the name, student ID, and email address." };
  }

  const targetGisu = await resolveStudentTargetGisu(normalizedStudentId);
  if (!targetGisu) return { error: "Unable to resolve the student cohort." };

  let reservation;
  try {
    reservation = await reserveDistribution(prisma, {
      source: "PORTAL_AUTO", createdBy: "system:distribution-portal", clientKey,
      target: {
        email: normalizedEmail, name: normalizedName, studentId: normalizedStudentId,
        targetRole: "STUDENT", targetGisu,
      },
    });
  } catch (error) {
    if (error instanceof DistributionReservationError) {
      return { error: error.code === "QUOTA" ? "The daily invitation email limit has been reached." : "Please wait before requesting another invitation." };
    }
    throw error;
  }

  const result = await sendInviteTokenEmail({
    source: "PORTAL_AUTO", createdBy: "system:distribution-portal", clientKey,
    target: {
      email: normalizedEmail, name: normalizedName, studentId: normalizedStudentId,
      targetRole: "STUDENT", targetGisu,
    },
    reservation,
  });
  if (result.success) await setPortalCooldownCookie();
  return result;
}
