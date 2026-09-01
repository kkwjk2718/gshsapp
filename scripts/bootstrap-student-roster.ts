import { PrismaClient } from "@prisma/client";

import { MEMBER_SERVICE_SUSPENDED } from "../src/lib/member-service-suspension";
import { MAX_STUDENT_ROSTER_BYTES, parseStudentRosterCsv } from "../src/lib/security/student-roster-import";
import { replaceStudentRosterInTransaction } from "../src/lib/security/student-roster-replacement";
import { withSqliteWriteRetry } from "../src/lib/security/sqlite-retry";

const LOGIN_ID = /^[A-Za-z0-9._-]{3,64}$/u;

function parseArguments(argv: readonly string[]) {
  let actorUserId = "";
  let confirmed = false;
  for (let index = 0; index < argv.length; index += 1) {
    if (argv[index] === "--actor-user-id" && index + 1 < argv.length) {
      actorUserId = argv[index + 1];
      index += 1;
    } else if (argv[index] === "--confirm" && argv[index + 1] === "REPLACE-ROSTER") {
      confirmed = true;
      index += 1;
    } else {
      throw new Error("ROSTER_BOOTSTRAP_ARGUMENTS");
    }
  }
  if (!LOGIN_ID.test(actorUserId) || !confirmed) throw new Error("ROSTER_BOOTSTRAP_ARGUMENTS");
  return { actorUserId };
}

async function readBoundedStdin() {
  const chunks: Buffer[] = [];
  let length = 0;
  for await (const chunk of process.stdin) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    length += buffer.length;
    if (length > MAX_STUDENT_ROSTER_BYTES) throw new Error("ROSTER_FILE_TOO_LARGE");
    chunks.push(buffer);
  }
  if (length === 0) throw new Error("ROSTER_EMPTY_INPUT");
  return Buffer.concat(chunks).toString("utf8");
}

async function main() {
  if (!MEMBER_SERVICE_SUSPENDED) throw new Error("ROSTER_BOOTSTRAP_REQUIRES_SUSPENSION");
  const { actorUserId } = parseArguments(process.argv.slice(2));
  const entries = parseStudentRosterCsv(await readBoundedStdin());
  const prisma = new PrismaClient();
  try {
    const actor = await prisma.user.findUnique({
      where: { userId: actorUserId },
      select: { id: true, role: true },
    });
    if (!actor || actor.role !== "ADMIN") throw new Error("ROSTER_ACTOR_NOT_ADMIN");
    const plan = await withSqliteWriteRetry(() => prisma.$transaction((tx) =>
      replaceStudentRosterInTransaction(tx, entries, actor.id),
    ));
    process.stdout.write(`Authoritative roster imported for academic year ${plan.academicYear} (${entries.length} rows).\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  const code = error instanceof Error && /^[A-Z0-9_]+$/u.test(error.message) ? error.message : "ROSTER_BOOTSTRAP_FAILED";
  process.stderr.write(`Student roster bootstrap refused (${code}).\n`);
  process.exitCode = 1;
});
