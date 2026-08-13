import { describe, expect, it, vi } from "vitest";

import { createLoginAttemptLimiter } from "@/lib/login-rate-limit";
import { PortalUnlockLimiter } from "@/lib/security/portal-unlock-limit";
import { BoundedAttemptAdmission } from "./attempt-admission";
import { BoundedKeyedLock, BoundedKeyedLockError, securityPrincipalLockKey } from "./bounded-keyed-lock";

describe("bounded keyed authentication serialization", () => {
  it("serializes a parallel login burst so a late correct candidate cannot pass a spent window", async () => {
    const gate = new BoundedKeyedLock();
    const limiter = createLoginAttemptLimiter({ identifierMaxFailures: 2, networkMaxFailures: 100 });
    const compare = vi.fn(async (candidate: string) => candidate === "correct");
    const attempt = (candidate: string) => gate.runExclusive([securityPrincipalLockKey("login", "same-id")], async () => {
      if (limiter.check("same-id", "same-network").locked) return false;
      const valid = await compare(candidate);
      if (!valid) limiter.recordFailure("same-id", "same-network");
      return valid;
    });

    await expect(Promise.all([attempt("bad-1"), attempt("bad-2"), attempt("correct")]))
      .resolves.toEqual([false, false, false]);
    expect(compare).toHaveBeenCalledTimes(2);
    expect(gate.size).toBe(0);
  });

  it("serializes portal bcrypt and enforces its failure window under a parallel burst", async () => {
    const gate = new BoundedKeyedLock();
    const limiter = new PortalUnlockLimiter({ clientMaxFailures: 2, networkMaxFailures: 100 });
    const compare = vi.fn(async (candidate: string) => candidate === "correct");
    const attempt = (candidate: string) => gate.runExclusive([securityPrincipalLockKey("portal", "same-client")], async () => {
      if (!limiter.check("same-client", "same-network").allowed) return false;
      const valid = await compare(candidate);
      if (!valid) limiter.recordFailure("same-client", "same-network");
      return valid;
    });

    await expect(Promise.all([attempt("bad-1"), attempt("bad-2"), attempt("correct")]))
      .resolves.toEqual([false, false, false]);
    expect(compare).toHaveBeenCalledTimes(2);
  });

  it("atomically caps rotated principals on a shared network without holding a bcrypt lock", async () => {
    const admission = new BoundedAttemptAdmission({ maxAttempts: 3, windowMs: 60_000, maxKeys: 2 });
    const admitted = await Promise.all(Array.from({ length: 6 }, async () => {
      const allowed = admission.admit("same-network");
      await Promise.resolve();
      return allowed;
    }));
    expect(admitted).toEqual([true, true, true, false, false, false]);
  });

  it("fails closed instead of growing unbounded queues or active key state", async () => {
    const gate = new BoundedKeyedLock({ maxKeys: 1, maxWaitersPerKey: 1, maxTotalWaiters: 1 });
    let release!: () => void;
    const held = new Promise<void>((resolve) => { release = resolve; });
    const first = gate.runExclusive(["a"], () => held);
    await Promise.resolve();
    await expect(gate.runExclusive(["b"], async () => undefined)).rejects.toBeInstanceOf(BoundedKeyedLockError);
    const queued = gate.runExclusive(["a"], async () => undefined);
    await Promise.resolve();
    await expect(gate.runExclusive(["a"], async () => undefined)).rejects.toMatchObject({ code: "QUEUE_FULL" });
    release();
    await Promise.all([first, queued]);
    expect(gate.size).toBe(0);
  });
});
