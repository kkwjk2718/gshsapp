import { getLastBackupAt, getLatestBackup, maybeRunScheduledBackup } from "../src/lib/backup";

async function main() {
  const before = await getLastBackupAt();

  await maybeRunScheduledBackup();

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

main().catch((error) => {
  console.error("Scheduled backup failed:", error);
  process.exit(1);
});
