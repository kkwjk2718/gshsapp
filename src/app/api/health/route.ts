import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { MEMBER_SERVICE_SUSPENDED } from "@/lib/member-service-suspension";

export const dynamic = "force-dynamic";

const SERVICE_NAME = "gshsapp";
const IMAGE_DIGEST_PATTERN = /^sha256:[0-9a-f]{64}$/u;

function jsonHeaders() {
  return {
    "Cache-Control": "no-store",
  };
}

export async function GET() {
  const version = process.env.APP_VERSION || "dev";
  const configuredDigest = process.env.APP_IMAGE_DIGEST?.trim() ?? "";
  const imageDigest = IMAGE_DIGEST_PATTERN.test(configuredDigest) ? configuredDigest : null;

  try {
    await prisma.$queryRaw`SELECT 1`;

    return NextResponse.json(
      {
        ok: true,
        service: SERVICE_NAME,
        version,
        imageDigest,
        memberServiceSuspended: MEMBER_SERVICE_SUSPENDED,
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
        imageDigest,
        memberServiceSuspended: MEMBER_SERVICE_SUSPENDED,
      },
      {
        headers: jsonHeaders(),
        status: 503,
      },
    );
  }
}
