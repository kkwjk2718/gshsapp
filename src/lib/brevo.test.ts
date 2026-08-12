import { afterEach, describe, expect, it, vi } from "vitest";

describe("Brevo response boundary", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("uses a timeout signal and accepts only a small JSON response", async () => {
    process.env.BREVO_API_KEY = "key"; process.env.BREVO_SENDER_EMAIL = "sender@example.com";
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ messageId: "message" }), {
      status: 201, headers: { "content-type": "application/json", "content-length": "24" },
    }));
    vi.stubGlobal("fetch", fetchMock);
    const { sendBrevoEmail } = await import("./brevo");
    await expect(sendBrevoEmail({ to: { email: "to@example.com" }, subject: "subject", htmlContent: "html", textContent: "text" })).resolves.toEqual({ messageId: "message" });
    expect(fetchMock).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ signal: expect.any(AbortSignal) }));
  });

  it("rejects non-JSON or oversized provider responses without reflecting their body", async () => {
    process.env.BREVO_API_KEY = "key"; process.env.BREVO_SENDER_EMAIL = "sender@example.com";
    const { sendBrevoEmail } = await import("./brevo");
    for (const response of [
      new Response("upstream secret", { status: 500, headers: { "content-type": "text/html" } }),
      new Response("x".repeat(8_193), { status: 500, headers: { "content-type": "application/json" } }),
    ]) {
      vi.stubGlobal("fetch", vi.fn().mockResolvedValue(response));
      await expect(sendBrevoEmail({ to: { email: "to@example.com" }, subject: "subject", htmlContent: "html", textContent: "text" }))
        .rejects.toThrow(/Brevo send failed|response/i);
      try { await sendBrevoEmail({ to: { email: "to@example.com" }, subject: "subject", htmlContent: "html", textContent: "text" }); } catch (error) {
        expect(String(error)).not.toContain("upstream secret");
      }
    }
  });
});
