import path from "node:path";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { getBackupDir } from "@/lib/backup";
import { requireAdmin } from "@/lib/current-user";

const PRIVATE_NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  try {
    await requireAdmin();
  } catch (error) {
    const status = (error as { status?: number }).status === 401 ? 401 : 403;
    return new NextResponse(status === 401 ? "Unauthorized" : "Forbidden", { status, headers: PRIVATE_NO_STORE });
  }

  const { file } = await params;
  const safe = path.basename(file);
  if (!(safe.endsWith('.db') || safe.endsWith('.bak') || safe.endsWith('.tar.gz') || safe.endsWith('.json'))) {
    return new NextResponse('Unsupported file type', { status: 400, headers: PRIVATE_NO_STORE });
  }
  const full = path.join(getBackupDir(), safe);

  try {
    const data = await fs.readFile(full);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename=\"${safe}\"`,
        ...PRIVATE_NO_STORE,
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404, headers: PRIVATE_NO_STORE });
  }
}
