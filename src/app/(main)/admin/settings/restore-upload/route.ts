import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { getRestoreRoot } from "@/lib/backup/paths";
import {
  cancelPendingRestore,
  getMaxRestoreUploadBytes,
  RestoreStagingError,
  stageRestoreUpload,
} from "@/lib/backup/restore-staging";
import { AuthorizationError, requireAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/db";
import { normalizeConfiguredTelemetryOrigin } from "@/lib/security/telemetry-request";
import { RESTORE_CONFIRM_TEXT } from "../backup-action-helpers";

export const runtime = "nodejs";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

function response(status: number, code: string, payload: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: status < 400, code, ...payload }, { status, headers: PRIVATE_NO_STORE });
}

function validRequestMetadata(request: Request): { ok: true } | { ok: false; status: number; code: string } {
  const configuredOrigin = normalizeConfiguredTelemetryOrigin(process.env.NEXT_PUBLIC_APP_URL ?? "");
  if (!configuredOrigin || request.headers.get("origin") !== configuredOrigin) {
    return { ok: false, status: 403, code: "BAD_ORIGIN" };
  }
  if (
    request.headers.get("sec-fetch-site") !== "same-origin" ||
    request.headers.get("sec-fetch-dest") !== "empty" ||
    !["cors", "same-origin"].includes(request.headers.get("sec-fetch-mode") ?? "")
  ) {
    return { ok: false, status: 403, code: "BAD_FETCH_METADATA" };
  }
  if (request.headers.get("content-type")?.toLocaleLowerCase("en-US") !== "application/octet-stream") {
    return { ok: false, status: 415, code: "BAD_CONTENT_TYPE" };
  }
  if (request.headers.get("x-gshs-restore-confirm") !== RESTORE_CONFIRM_TEXT) {
    return { ok: false, status: 400, code: "BAD_CONFIRMATION" };
  }
  return { ok: true };
}

function parseContentLength(request: Request): number | null | "invalid" {
  const value = request.headers.get("content-length");
  if (value === null) return null;
  if (!/^\d+$/u.test(value)) return "invalid";
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) ? parsed : "invalid";
}

function mapStagingError(error: RestoreStagingError) {
  switch (error.code) {
    case "UPLOAD_TOO_LARGE": return response(413, error.code);
    case "RESTORE_PENDING":
    case "RESTORE_ID_MISMATCH": return response(409, error.code);
    case "RESTORE_NOT_FOUND": return response(404, error.code);
    case "INVALID_BODY":
    case "INVALID_LENGTH":
    case "INVALID_FILENAME":
    case "FORMAT_MISMATCH":
    case "INVALID_ARTIFACT": return response(400, error.code);
    default: return response(500, "RESTORE_STAGE_FAILED");
  }
}

export async function POST(request: Request) {
  let actorId: string | null = null;
  let restoreId: string | null = null;
  let requestAudited = false;
  try {
    const actor = await requireAdmin();
    actorId = actor.id;

    const metadata = validRequestMetadata(request);
    if (!metadata.ok) return response(metadata.status, metadata.code);

    const maximum = getMaxRestoreUploadBytes();
    const contentLength = parseContentLength(request);
    if (contentLength === "invalid") return response(400, "INVALID_LENGTH");
    if (contentLength !== null && contentLength > maximum) return response(413, "UPLOAD_TOO_LARGE");

    const originalName = request.headers.get("x-gshs-restore-filename") ?? "";
    restoreId = randomBytes(18).toString("base64url");
    await writeAuditLog(prisma, {
      actorId,
      action: "BACKUP_RESTORE_REQUESTED",
      target: { type: "BACKUP", id: restoreId },
    });
    requestAudited = true;

    const staged = await stageRestoreUpload({
      body: request.body,
      contentLength,
      originalName,
      restoreRoot: getRestoreRoot(),
      maxBytes: maximum,
      createId: () => restoreId as string,
    });

    await writeAuditLog(prisma, {
      actorId,
      action: "BACKUP_RESTORE_STAGED",
      target: { type: "BACKUP", id: staged.id },
    });
    return response(202, "RESTORE_STAGED", {
      restoreId: staged.id,
      expiresAt: staged.expiresAt,
      message: "Restore validated and staged. Automatic application is disabled; operator review is required.",
    });
  } catch (error) {
    if (error instanceof AuthorizationError) return response(403, "FORBIDDEN");
    if (error instanceof RestoreStagingError) {
      if (requestAudited && actorId && restoreId) {
        try {
          await writeAuditLog(prisma, {
            actorId,
            action: "BACKUP_RESTORE_REJECTED",
            target: { type: "BACKUP", id: restoreId },
          });
        } catch {
          return response(500, "AUDIT_FAILED");
        }
      }
      return mapStagingError(error);
    }
    return response(500, "RESTORE_STAGE_FAILED");
  }
}

export async function DELETE(request: Request) {
  try {
    const actor = await requireAdmin();
    const metadata = validRequestMetadata(request);
    if (!metadata.ok) return response(metadata.status, metadata.code);
    const restoreId = request.headers.get("x-gshs-restore-id") ?? "";
    await writeAuditLog(prisma, {
      actorId: actor.id,
      action: "BACKUP_RESTORE_CANCEL_REQUESTED",
      target: { type: "BACKUP", id: restoreId },
    });
    const descriptor = await cancelPendingRestore({
      restoreRoot: getRestoreRoot(),
      expectedId: restoreId,
    });
    await writeAuditLog(prisma, {
      actorId: actor.id,
      action: "BACKUP_RESTORE_CANCELLED",
      target: { type: "BACKUP", id: descriptor.id },
    });
    return response(200, "RESTORE_CANCELLED", { restoreId: descriptor.id });
  } catch (error) {
    if (error instanceof AuthorizationError) return response(403, "FORBIDDEN");
    if (error instanceof RestoreStagingError) return mapStagingError(error);
    return response(500, "RESTORE_CANCEL_FAILED");
  }
}
