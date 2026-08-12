import { describe, expect, it } from "vitest";

import { serializeTokenCsv } from "./token-csv";

describe("token CSV", () => {
  it("neutralizes token, role, and used-by values and includes one BOM", () => {
    const csv = serializeTokenCsv([{ token: "=TOKEN", targetRole: "+ROLE", targetGisu: null, isUsed: true, usedBy: { name: "@NAME", studentId: "-ID", role: "STUDENT" } }]);
    expect(csv.startsWith("\ufeff\ufeff")).toBe(false);
    for (const value of ["'=TOKEN", "'+ROLE", "'@NAME", "'-ID"]) expect(csv).toContain(`"${value}"`);
  });
});
