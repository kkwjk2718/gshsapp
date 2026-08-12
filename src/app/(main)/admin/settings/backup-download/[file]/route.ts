import path from "node:path";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getBackupDir } from "@/lib/backup";
import { AuthorizationError, requireAdmin } from "@/lib/current-user";
import { writeAuditLog } from "@/lib/audit";
import { prisma } from "@/lib/db";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  try {
    const actor = await requireAdmin();

    const { file } = await params;
    const safe = path.basename(file);
    if (!(safe.endsWith('.db') || safe.endsWith('.bak') || safe.endsWith('.tar.gz') || safe.endsWith('.json'))) {
      return new NextResponse('Unsupported file type', { status: 400, headers: PRIVATE_NO_STORE });
    }
    const full = path.join(getBackupDir(), safe);

    let data: Buffer;
    try {
      data = await fs.readFile(full);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        return new NextResponse("Not found", { status: 404, headers: PRIVATE_NO_STORE });
      }
      throw error;
    }
    await writeAuditLog(prisma, {
      actorId: actor.id,
      action: "BACKUP_DOWNLOADED",
      target: { type: "BACKUP", id: safe },
    });
    return new NextResponse(new Uint8Array(data), {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename=\"${safe}\"`,
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
