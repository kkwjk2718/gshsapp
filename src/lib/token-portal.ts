import { prisma } from "@/lib/db";
import { DistributionReservationError, reserveDistribution } from "@/lib/distribution-reservation";
import { logAction } from "@/lib/logger";
import { getApplicationSecuritySecret, hashSecurityPrincipal } from "@/lib/security/principal-key";
import {
  getDistributionQuotaSummary,
  recordBlockedTokenDistribution,
  sendInviteTokenEmail,
} from "@/lib/token-distribution";
import {
  getPortalClientKey,
  getPortalCooldownRemainingSeconds,
  setPortalCooldownCookie,
} from "@/lib/token-portal-session";
import { getTokenPortalSettings, publicTokenPortalSettings } from "@/lib/system-settings";
import { parsePortalInviteInput } from "@/lib/security/portal-input";

export async function getPublicPortalState() {
  const settings = await getTokenPortalSettings();
  const cooldownSeconds = await getPortalCooldownRemainingSeconds();
  const quota = await getDistributionQuotaSummary();
  return { settings: publicTokenPortalSettings(settings), cooldownSeconds, quota };
}

export async function sendPortalStudentInvite({ name, studentId, email, rosterEntryId, rosterGisu }: {
  name: string;
  studentId: string;
  email: string;
  rosterEntryId: string;
  rosterGisu: number;
}) {
  const input = parsePortalInviteInput({ name, studentId, email });
  if (!input) return { error: "Please check the name, student ID, and email address." };
  const { name: normalizedName, email: normalizedEmail, studentId: normalizedStudentId } = input;
  const portalState = await getPublicPortalState();
  const rawClientKey = await getPortalClientKey();
  const clientKey = hashSecurityPrincipal("portal-client", rawClientKey, getApplicationSecuritySecret());

  if (!portalState.settings.enabled) {
    await recordBlockedTokenDistribution({
      source: "PORTAL_AUTO", recipientEmail: normalizedEmail, requesterName: normalizedName,
      studentId: normalizedStudentId, targetRole: "STUDENT", errorMessage: "Portal disabled.",
      clientKey, createdBy: "system:distribution-portal",
    });
    await logAction("token_portal_blocked", { reason: "disabled" });
    return { error: "The token distribution portal is disabled." };
  }

  const targetGisu = rosterGisu;
  if (!Number.isInteger(targetGisu) || targetGisu < 1 || targetGisu > 200) {
    return { error: "Unable to resolve the student cohort." };
  }

  let reservation;
  try {
    reservation = await reserveDistribution(prisma, {
      source: "PORTAL_AUTO", createdBy: "system:distribution-portal", clientKey,
      target: {
        email: normalizedEmail, name: normalizedName, studentId: normalizedStudentId, rosterEntryId,
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
