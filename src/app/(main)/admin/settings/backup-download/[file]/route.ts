import { constants } from "node:fs";
import fs from "node:fs/promises";
import { Readable } from "node:stream";
import { NextResponse } from "next/server";

import { writeAuditLog } from "@/lib/audit";
import { getBackupDir } from "@/lib/backup";
import { resolveStoredBackup } from "@/lib/backup/backup-engine";
import { AuthorizationError, requireAdmin } from "@/lib/current-user";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  try {
    const actor = await requireAdmin();
    const { file } = await params;

    let stored: Awaited<ReturnType<typeof resolveStoredBackup>>;
    try {
      stored = await resolveStoredBackup(getBackupDir(), file);
    } catch {
      return new NextResponse("Not found", { status: 404, headers: PRIVATE_NO_STORE });
    }

    let handle: Awaited<ReturnType<typeof fs.open>>;
    try {
      handle = await fs.open(stored.path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
      const stats = await handle.stat();
      if (!stats.isFile() || stats.size !== stored.size || stats.dev !== stored.dev || stats.ino !== stored.ino) {
        await handle.close();
        return new NextResponse("Not found", { status: 404, headers: PRIVATE_NO_STORE });
      }
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (["ENOENT", "ELOOP", "EACCES"].includes(code ?? "")) {
        return new NextResponse("Not found", { status: 404, headers: PRIVATE_NO_STORE });
      }
      throw error;
    }

    try {
      await writeAuditLog(prisma, {
        actorId: actor.id,
        action: "BACKUP_DOWNLOADED",
        target: { type: "BACKUP", id: stored.file },
      });
    } catch (error) {
      await handle.close().catch(() => undefined);
      throw error;
    }

    const nodeStream = handle.createReadStream({ autoClose: true });
    const body = Readable.toWeb(nodeStream) as ReadableStream<Uint8Array>;
    return new NextResponse(body, {
      status: 200,
      headers: {
        "Content-Type": stored.contentType,
        "Content-Length": String(stored.size),
        "Content-Disposition": `attachment; filename="${stored.file}"`,
        ...PRIVATE_NO_STORE,
      },
    });
  } catch (error) {
    if (error instanceof AuthorizationError) {
      return new NextResponse("Forbidden", { status: 403, headers: PRIVATE_NO_STORE });
    }
    return new NextResponse("Internal Server Error", { status: 500, headers: PRIVATE_NO_STORE });
  }
}
