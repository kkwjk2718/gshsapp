import fs from "node:fs/promises";

export async function syncDirectory(directory: string): Promise<void> {
  let handle;
  try {
    handle = await fs.open(directory, "r");
  } catch (error) {
    // Windows does not expose directory fsync consistently; production backup
    // and restore runtimes are Linux and must fail rather than claim durability.
    if (process.platform === "win32" && ["EACCES", "EPERM", "EISDIR"].includes((error as NodeJS.ErrnoException).code ?? "")) return;
    throw error;
  }
  try {
    try {
      await handle.sync();
    } catch (error) {
      if (!(process.platform === "win32" && ["EACCES", "EPERM", "EISDIR"].includes((error as NodeJS.ErrnoException).code ?? ""))) {
        throw error;
      }
    }
  } finally {
    await handle.close();
  }
}
