import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("credential network trust boundary", () => {
  it("rejects an unresolved configured proxy address before database lookup and bcrypt", () => {
    const source = readFileSync(join(process.cwd(), "src", "auth.ts"), "utf8");
    const trustGate = source.indexOf("if (!isSensitiveClientAddressTrusted(clientAddress, trustedProxyHops)) return null;");
    const userLookup = source.indexOf("prisma.user.findUnique");
    const passwordVerification = source.indexOf("const verifiedUser = await verifyLoginCandidate");
    expect(trustGate).toBeGreaterThan(-1);
    expect(trustGate).toBeLessThan(userLookup);
    expect(trustGate).toBeLessThan(passwordVerification);
  });
});
