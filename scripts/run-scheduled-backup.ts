import { createBackup, getLastBackupAt, getLatestBackup, maybeRunScheduledBackup, setLastBackupAt } from "../src/lib/backup";
import { prisma } from "../src/lib/db";

async function main() {
  const before = await getLastBackupAt();

  if (process.argv.includes("--force")) {
    await createBackup("pre-deployment");
    await setLastBackupAt(new Date());
  } else {
    await maybeRunScheduledBackup();
  }

  const [after, latestBackup] = await Promise.all([
    getLastBackupAt(),
    getLatestBackup(),
  ]);

  const payload = {
    beforeLastBackupAt: before?.toISOString() ?? null,
    afterLastBackupAt: after?.toISOString() ?? null,
    latestBackupFile: latestBackup?.file ?? null,
    latestBackupCreatedAt: latestBackup?.createdAt.toISOString() ?? null,
  };

  console.log(JSON.stringify(payload, null, 2));
}

try {
  await main();
} catch {
  console.error("Scheduled backup failed.");
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
