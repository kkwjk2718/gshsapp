import type { Readable } from "node:stream";

interface BoundedReadOptions {
  maxBytes: number;
  contentLength?: string | null;
}

interface BoundedJsonReadOptions extends BoundedReadOptions {
  allowedContentTypes?: readonly string[];
}

const OUTBOUND_ERROR_MAX_LENGTH = 500;

export function formatOutboundError(error: unknown) {
  let message = "Unknown outbound error.";
  try {
    if (error instanceof Error && typeof error.message === "string") message = error.message;
    else if (typeof error === "string") message = error;
  } catch {
    // Do not evaluate attacker-controlled getters while formatting an error.
  }

  const normalized = message.replace(/[\u0000-\u001f\u007f]+/g, " ").trim();
  return (normalized || "Unknown outbound error.").slice(0, OUTBOUND_ERROR_MAX_LENGTH);
}

function assertValidLimit(maxBytes: number) {
  if (!Number.isSafeInteger(maxBytes) || maxBytes <= 0) {
    throw new Error("Outbound response byte limit is invalid.");
  }
}

function assertContentLength(contentLength: string | null | undefined, maxBytes: number) {
  if (!contentLength) return;
  if (!/^\d+$/.test(contentLength)) return;

  const parsed = Number(contentLength);
  if (Number.isSafeInteger(parsed) && parsed > maxBytes) {
    throw new Error("Outbound response is too large.");
  }
}

function isJsonContentType(contentType: string | null, allowedContentTypes?: readonly string[]) {
  if (!contentType) return false;
  const mediaType = contentType.split(";", 1)[0].trim().toLowerCase();
  if (allowedContentTypes?.some((allowed) => allowed.toLowerCase() === mediaType)) return true;
  return !allowedContentTypes && (
    mediaType === "application/json" ||
    (mediaType.startsWith("application/") && mediaType.endsWith("+json"))
  );
}

export async function cancelResponseBody(response: Response, reason = "response rejected") {
  if (!response.body || response.body.locked) return;
  await response.body.cancel(reason).catch(() => undefined);
}

export async function readBoundedResponseText(
  response: Response,
  { maxBytes }: BoundedReadOptions,
): Promise<string> {
  assertValidLimit(maxBytes);
  try {
    assertContentLength(response.headers.get("content-length"), maxBytes);
  } catch (error) {
    await cancelResponseBody(response, "content length exceeds limit");
    throw error;
  }

  if (!response.body) return "";

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let totalBytes = 0;

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;

      totalBytes += value.byteLength;
      if (totalBytes > maxBytes) {
        await reader.cancel("response too large").catch(() => undefined);
        throw new Error("Outbound response is too large.");
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(totalBytes);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

export async function readBoundedJsonResponse<T = unknown>(
  response: Response,
  { maxBytes, allowedContentTypes }: BoundedJsonReadOptions,
): Promise<T> {
  if (!isJsonContentType(response.headers.get("content-type"), allowedContentTypes)) {
    await cancelResponseBody(response, "invalid JSON content type");
    throw new Error("Outbound response has an invalid JSON content type.");
  }

  const text = await readBoundedResponseText(response, { maxBytes });
  return JSON.parse(text) as T;
}

export async function readBoundedNodeStreamText(
  stream: Readable,
  { maxBytes, contentLength }: BoundedReadOptions,
): Promise<string> {
  assertValidLimit(maxBytes);
  try {
    assertContentLength(contentLength, maxBytes);
  } catch (error) {
    stream.destroy();
    throw error;
  }

  const chunks: Buffer[] = [];
  let totalBytes = 0;

  for await (const rawChunk of stream) {
    const chunk = Buffer.isBuffer(rawChunk) ? rawChunk : Buffer.from(rawChunk as Uint8Array | string);
    totalBytes += chunk.byteLength;
    if (totalBytes > maxBytes) {
      stream.destroy(new Error("Outbound response is too large."));
      throw new Error("Outbound response is too large.");
    }
    chunks.push(chunk);
  }

  return new TextDecoder("utf-8", { fatal: true }).decode(Buffer.concat(chunks, totalBytes));
}
