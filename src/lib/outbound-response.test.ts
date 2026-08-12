import { Readable } from "node:stream";
import { describe, expect, it } from "vitest";
import {
  readBoundedJsonResponse,
  readBoundedNodeStreamText,
  readBoundedResponseText,
} from "@/lib/outbound-response";

describe("bounded outbound response readers", () => {
  it("rejects an oversized web stream even when Content-Length is absent", async () => {
    const response = new Response(
      new ReadableStream({
        start(controller) {
          controller.enqueue(new TextEncoder().encode("1234"));
          controller.enqueue(new TextEncoder().encode("5678"));
          controller.close();
        },
      }),
      { headers: { "content-type": "text/plain" } },
    );

    await expect(readBoundedResponseText(response, { maxBytes: 7 })).rejects.toThrow("too large");
  });

  it("rejects a misleading Content-Length before reading", async () => {
    const response = new Response("{}", {
      headers: { "content-type": "application/json", "content-length": "999" },
    });

    await expect(readBoundedJsonResponse(response, { maxBytes: 32 })).rejects.toThrow("too large");
  });

  it("requires an allowed JSON media type", async () => {
    const response = new Response("{}", { headers: { "content-type": "text/html" } });
    await expect(readBoundedJsonResponse(response, { maxBytes: 32 })).rejects.toThrow("content type");
  });

  it("accepts a provider's explicitly allowed JSON-compatible text media type", async () => {
    const response = new Response('{"ok":true}', { headers: { "content-type": "text/plain; charset=utf-8" } });
    await expect(
      readBoundedJsonResponse(response, {
        maxBytes: 32,
        allowedContentTypes: ["application/json", "text/plain"],
      }),
    ).resolves.toEqual({ ok: true });
  });

  it("caps Node streams used by pinned HTTPS requests", async () => {
    const stream = Readable.from([Buffer.from("1234"), Buffer.from("5678")]);
    await expect(readBoundedNodeStreamText(stream, { maxBytes: 7 })).rejects.toThrow("too large");
  });
});
