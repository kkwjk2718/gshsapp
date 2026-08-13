import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  requireAdmin: vi.fn(),
  stageRestoreUpload: vi.fn(),
  cancelPendingRestore: vi.fn(),
  auditCreate: vi.fn(),
}));

class TestAuthorizationError extends Error {}

vi.mock("@/lib/current-user", () => ({
  requireAdmin: mocks.requireAdmin,
  AuthorizationError: TestAuthorizationError,
}));
vi.mock("@/lib/backup/restore-staging", () => ({
  getMaxRestoreUploadBytes: () => 100,
  stageRestoreUpload: mocks.stageRestoreUpload,
  cancelPendingRestore: mocks.cancelPendingRestore,
  RestoreStagingError: class RestoreStagingError extends Error { constructor(readonly code: string) { super(code); } },
}));
vi.mock("@/lib/backup/paths", () => ({ getRestoreRoot: () => "C:\\data\\restore" }));
vi.mock("@/lib/db", () => ({ prisma: { auditLog: { create: mocks.auditCreate } } }));

function request(overrides: Partial<{
  origin: string;
  fetchSite: string;
  contentType: string;
  confirm: string;
  filename: string;
  contentLength: string;
  body: ReadableStream<Uint8Array>;
  restoreId: string;
}> = {}) {
  const headers = new Headers({
    origin: overrides.origin ?? "https://gshs.app",
    "sec-fetch-site": overrides.fetchSite ?? "same-origin",
    "sec-fetch-mode": "cors",
    "sec-fetch-dest": "empty",
    "content-type": overrides.contentType ?? "application/octet-stream",
    "x-gshs-restore-confirm": overrides.confirm ?? "RESTORE",
    "x-gshs-restore-filename": overrides.filename ?? "backup.db",
    "x-gshs-restore-id": overrides.restoreId ?? "opaque-restore-id-123456",
  });
  if (overrides.contentLength !== undefined) headers.set("content-length", overrides.contentLength);
  return {
    url: "https://gshs.app/admin/settings/restore-upload",
    headers,
    body: overrides.body ?? ({ getReader: vi.fn() } as unknown as ReadableStream<Uint8Array>),
  } as Request;
}

describe("restore upload route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "https://gshs.app";
    mocks.auditCreate.mockResolvedValue({ id: "audit" });
    mocks.stageRestoreUpload.mockResolvedValue({
      id: "opaque-restore-id-123456",
      format: "db",
      bytes: 32,
      sha256: "a".repeat(64),
      expiresAt: "2026-08-14T00:00:00.000Z",
    });
    mocks.cancelPendingRestore.mockResolvedValue({ id: "opaque-restore-id-123456" });
  });

  it("authorizes against current database state before reading or staging a body", async () => {
    mocks.requireAdmin.mockRejectedValue(new TestAuthorizationError("Forbidden"));
    const body = { getReader: vi.fn() } as unknown as ReadableStream<Uint8Array>;
    const { POST } = await import("./route");
    const response = await POST(request({ body }));
    expect(response.status).toBe(403);
    expect(body.getReader).not.toHaveBeenCalled();
    expect(mocks.stageRestoreUpload).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it.each([
    { origin: "https://evil.example", status: 403 },
    { fetchSite: "cross-site", status: 403 },
    { contentType: "multipart/form-data", status: 415 },
    { confirm: "restore", status: 400 },
  ])("rejects invalid request metadata before staging", async (overrides) => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "ADMIN" });
    const { POST } = await import("./route");
    const response = await POST(request(overrides));
    expect(response.status).toBe(overrides.status);
    expect(mocks.stageRestoreUpload).not.toHaveBeenCalled();
  });

  it("rejects an oversized declared body before audit or body access", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "ADMIN" });
    const body = { getReader: vi.fn() } as unknown as ReadableStream<Uint8Array>;
    const { POST } = await import("./route");
    const response = await POST(request({ contentLength: "101", body }));
    expect(response.status).toBe(413);
    expect(body.getReader).not.toHaveBeenCalled();
    expect(mocks.auditCreate).not.toHaveBeenCalled();
  });

  it("persists a pre-change audit before staging and returns only an opaque identifier", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "ADMIN" });
    const { POST } = await import("./route");
    const response = await POST(request({ contentLength: "32" }));
    expect(response.status).toBe(202);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.auditCreate.mock.invocationCallOrder[0]).toBeLessThan(mocks.stageRestoreUpload.mock.invocationCallOrder[0]);
    expect(mocks.stageRestoreUpload).toHaveBeenCalledWith(expect.objectContaining({
      contentLength: 32,
      originalName: "backup.db",
      restoreRoot: "C:\\data\\restore",
    }));
    const payload = await response.json();
    expect(payload).toEqual(expect.objectContaining({ ok: true, restoreId: "opaque-restore-id-123456" }));
    expect(JSON.stringify(payload)).not.toContain("C:\\data");
  });

  it("authorizes and audits an exact-id cancellation before deleting staged restore data", async () => {
    mocks.requireAdmin.mockResolvedValue({ id: "admin", role: "ADMIN" });
    const route = await import("./route") as typeof import("./route") & {
      DELETE: (request: Request) => Promise<Response>;
    };
    const response = await route.DELETE(request({ restoreId: "opaque-restore-id-123456" }));

    expect(response.status).toBe(200);
    expect(mocks.auditCreate.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.cancelPendingRestore.mock.invocationCallOrder[0],
    );
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "BACKUP_RESTORE_CANCEL_REQUESTED", targetId: "opaque-restore-id-123456" }),
    });
    expect(mocks.cancelPendingRestore).toHaveBeenCalledWith(expect.objectContaining({
      restoreRoot: "C:\\data\\restore",
      expectedId: "opaque-restore-id-123456",
    }));
    expect(mocks.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ action: "BACKUP_RESTORE_CANCELLED", targetId: "opaque-restore-id-123456" }),
    });
  });
});
