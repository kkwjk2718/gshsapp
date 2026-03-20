import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const dynamic = "force-dynamic";

const SERVICE_NAME = "gshsapp";

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
  };
}

export async function GET() {
  const version = process.env.APP_VERSION || "dev";

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        ok: true,
        service: SERVICE_NAME,
        version,
      },
      {
        headers: jsonHeaders(),
      },
    );
  } catch {
    return NextResponse.json(
      {
        ok: false,
        service: SERVICE_NAME,
        version,
      },
      {
        headers: jsonHeaders(),
        status: 503,
      },
    );
  }
}
