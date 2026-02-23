import path from "node:path";
import fs from "node:fs/promises";
import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBackupDir } from "@/lib/backup";

export async function GET(_: Request, { params }: { params: Promise<{ file: string }> }) {
  const session = await auth();
  if (!session?.user || session.user.role !== "ADMIN") {
    return new NextResponse("Unauthorized", { status: 401 });
  }

  const { file } = await params;
  const safe = path.basename(file);
  if (!(safe.endsWith('.db') || safe.endsWith('.tar.gz') || safe.endsWith('.json'))) {
    return new NextResponse('Unsupported file type', { status: 400 });
  }
  const full = path.join(getBackupDir(), safe);

  try {
    const data = await fs.readFile(full);
    return new NextResponse(data, {
      status: 200,
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename=\"${safe}\"`,
      },
    });
  } catch {
    return new NextResponse("Not found", { status: 404 });
  }
}
