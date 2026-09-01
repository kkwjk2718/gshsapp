import { constants } from "node:fs";
import fs from "node:fs/promises";

type ExpectedFileIdentity = Readonly<{
  dev: number;
  ino: number;
  size: number;
}>;

type PrivateCopyOptions = Readonly<{
  maxBytes?: number;
  expected?: ExpectedFileIdentity;
}>;

function sameIdentity(left: ExpectedFileIdentity, right: ExpectedFileIdentity) {
  return left.dev === right.dev && left.ino === right.ino && left.size === right.size;
}

export async function copyRegularFileExclusive(
  source: string,
  destination: string,
  options: PrivateCopyOptions = {},
): Promise<number> {
  const maxBytes = options.maxBytes ?? Number.MAX_SAFE_INTEGER;
  if (!Number.isSafeInteger(maxBytes) || maxBytes < 1) throw new Error("Invalid private copy limit");

  const listed = await fs.lstat(source);
  if (!listed.isFile() || listed.isSymbolicLink() || (options.expected && !sameIdentity(listed, options.expected))) {
    throw new Error("Invalid private copy source");
  }

  let sourceHandle: fs.FileHandle | undefined;
  let destinationHandle: fs.FileHandle | undefined;
  let destinationCreated = false;
  let completed = false;
  try {
    sourceHandle = await fs.open(source, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const opened = await sourceHandle.stat();
    if (!opened.isFile() || !sameIdentity(listed, opened) || opened.size > maxBytes) {
      throw new Error("Invalid private copy source");
    }

    destinationHandle = await fs.open(destination, "wx", 0o600);
    destinationCreated = true;
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let total = 0;
    for (;;) {
      const { bytesRead } = await sourceHandle.read(buffer, 0, buffer.length, total);
      if (bytesRead === 0) break;
      if (!Number.isSafeInteger(total + bytesRead) || total + bytesRead > maxBytes) {
        throw new Error("Private copy byte limit exceeded");
      }
      let written = 0;
      while (written < bytesRead) {
        const result = await destinationHandle.write(buffer, written, bytesRead - written, total + written);
        if (result.bytesWritten < 1) throw new Error("Private copy write failed");
        written += result.bytesWritten;
      }
      total += bytesRead;
    }

    const finalSource = await sourceHandle.stat();
    const finalDestination = await destinationHandle.stat();
    if (!sameIdentity(opened, finalSource) || total !== opened.size || finalDestination.size !== total) {
      throw new Error("Private copy source changed");
    }
    await destinationHandle.sync();
    completed = true;
    return total;
  } finally {
    await sourceHandle?.close().catch(() => undefined);
    await destinationHandle?.close().catch(() => undefined);
    if (destinationCreated && !completed) await fs.rm(destination, { force: true }).catch(() => undefined);
  }
}
