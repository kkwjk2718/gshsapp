import { describe, expect, it, vi } from "vitest";

import { createLoginAttemptLimiter } from "@/lib/login-rate-limit";
import { PortalUnlockLimiter } from "@/lib/security/portal-unlock-limit";
import { BoundedAttemptAdmission } from "./attempt-admission";
import { BoundedConcurrencyGate, BoundedKeyedConcurrencyGate } from "./bounded-concurrency-gate";
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

  it("atomically caps rotated principals while releasing only each successful reservation", async () => {
    const admission = new BoundedAttemptAdmission({ maxAttempts: 3, windowMs: 60_000, maxKeys: 2 });
    const reservations = await Promise.all(Array.from({ length: 6 }, async () => {
      const reservation = admission.reserve("same-network");
      await Promise.resolve();
      return reservation;
    }));
    expect(reservations.map(Boolean)).toEqual([true, true, true, false, false, false]);
    reservations[0]!.release();
    reservations[1]!.release();
    reservations[2]!.commitFailure();
    const next = [admission.reserve("same-network"), admission.reserve("same-network"), admission.reserve("same-network")];
    expect(next.map(Boolean)).toEqual([true, true, false]);
  });

  it("evicts a completed LRU network instead of globally denying new networks", () => {
    const admission = new BoundedAttemptAdmission({ maxAttempts: 3, windowMs: 60_000, maxKeys: 1 });
    admission.reserve("old-network")!.commitFailure();
    expect(admission.reserve("new-network")).not.toBeNull();
  });

  it("separately caps in-flight work for one network and across all networks", () => {
    const admission = new BoundedAttemptAdmission({
      maxAttempts: 100,
      maxPendingPerKey: 2,
      windowMs: 60_000,
      maxKeys: 10,
    });
    expect([1, 2, 3].map(() => Boolean(admission.reserve("same-network"))))
      .toEqual([true, true, false]);

    const globalGate = new BoundedConcurrencyGate(2);
    const first = globalGate.tryAcquire();
    const second = globalGate.tryAcquire();
    expect(first).not.toBeNull();
    expect(second).not.toBeNull();
    expect(globalGate.tryAcquire()).toBeNull();
    first!.release();
    expect(globalGate.tryAcquire()).not.toBeNull();
  });

  it("admits only one active operation for the same bearer secret", () => {
    const gate = new BoundedKeyedConcurrencyGate(2);
    const first = gate.tryAcquire("same-invite-hash");
    expect(first).not.toBeNull();
    expect(gate.tryAcquire("same-invite-hash")).toBeNull();
    expect(gate.tryAcquire("different-invite-hash")).not.toBeNull();
    expect(gate.tryAcquire("third-invite-hash")).toBeNull();
    first!.release();
    expect(gate.tryAcquire("same-invite-hash")).not.toBeNull();
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
