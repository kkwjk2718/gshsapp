import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getCurrentUser: vi.fn(),
  create: vi.fn(),
  count: vi.fn(),
  audit: vi.fn(),
  transaction: vi.fn(),
  revalidatePath: vi.fn(),
}));

vi.mock("@/lib/session", () => ({ getCurrentUser: mocks.getCurrentUser }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }));
vi.mock("@/lib/audit", () => ({ writeAuditLog: mocks.audit }));
vi.mock("@/lib/db", () => ({ prisma: { $transaction: mocks.transaction } }));

import { createLink } from "./actions";

function linkForm(url = "https://school.example/resource") {
  const form = new FormData();
  form.set("title", "School resource");
  form.set("url", url);
  form.set("description", "Official link");
  form.set("category", "SCHOOL");
  return form;
}

describe("link write boundaries", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getCurrentUser.mockResolvedValue({ id: "teacher-1", role: "TEACHER" });
    mocks.create.mockResolvedValue({ id: "550e8400-e29b-41d4-a716-446655440000" });
    mocks.count.mockResolvedValue(1);
    mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
      linkItem: { create: mocks.create, count: mocks.count },
      auditLog: { create: vi.fn() },
    }));
  });

  it("rejects non-HTTPS links before writing", async () => {
    await expect(createLink(linkForm("javascript:alert(1)"))).rejects.toThrow("Invalid link URL");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rolls back the newly created row if the hard corpus cap would be exceeded", async () => {
    mocks.count.mockResolvedValue(251);
    await expect(createLink(linkForm())).rejects.toThrow("Link limit reached");
    expect(mocks.audit).not.toHaveBeenCalled();
  });

  it("creates and audits a bounded link in one transaction", async () => {
    await createLink(linkForm());
    expect(mocks.create).toHaveBeenCalledWith({ data: {
      title: "School resource",
      url: "https://school.example/resource",
      description: "Official link",
      category: "SCHOOL",
    } });
    expect(mocks.audit).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({
      actorId: "teacher-1", action: "LINK_CREATED",
    }));
  });
});
