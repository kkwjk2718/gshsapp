type State = {
  failures: number[];
  pending: Map<symbol, number>;
  lastSeenAt: number;
};

export type AttemptReservation = Readonly<{
  commitFailure(): void;
  release(): void;
}>;

export class BoundedAttemptAdmission {
  readonly #states = new Map<string, State>();
  readonly #now: () => number;

  constructor(readonly policy: Readonly<{
    maxAttempts: number;
    windowMs: number;
    maxKeys: number;
    pendingTtlMs?: number;
    now?: () => number;
  }>) {
    for (const value of [policy.maxAttempts, policy.windowMs, policy.maxKeys, policy.pendingTtlMs ?? 120_000]) {
      if (!Number.isInteger(value) || value < 1) throw new Error("Invalid attempt admission policy");
    }
    this.#now = policy.now ?? Date.now;
  }

  #normalize(state: State, now: number, touch = true) {
    state.failures = state.failures.filter((time) => time > now - this.policy.windowMs);
    const pendingTtl = this.policy.pendingTtlMs ?? 120_000;
    for (const [token, startedAt] of state.pending) {
      if (startedAt <= now - pendingTtl) state.pending.delete(token);
    }
    if (touch) state.lastSeenAt = now;
  }

  #ensureCapacity(now: number) {
    if (this.#states.size < this.policy.maxKeys) return true;
    let oldestKey: string | null = null;
    let oldestSeen = Number.POSITIVE_INFINITY;
    for (const [key, state] of this.#states) {
      this.#normalize(state, now, false);
      // Never invalidate a live reservation. A completed LRU network may be
      // evicted because the primary limiter independently retains its failure
      // window; rejecting every new network at capacity would be a global DoS.
      if (state.pending.size === 0 && state.lastSeenAt < oldestSeen) {
        oldestKey = key;
        oldestSeen = state.lastSeenAt;
      }
    }
    if (oldestKey) this.#states.delete(oldestKey);
    return this.#states.size < this.policy.maxKeys;
  }

  // Reservation is synchronous, so failures+in-flight checks form one event-loop
  // critical section. Success releases only its own token; it can never erase a
  // different request's failure timestamp.
  reserve(key: string | null): AttemptReservation | null {
    if (key === null) return { commitFailure() {}, release() {} };
    const now = this.#now();
    let state = this.#states.get(key);
    if (!state) {
      if (!this.#ensureCapacity(now)) return null;
      state = { failures: [], pending: new Map(), lastSeenAt: now };
      this.#states.set(key, state);
    }
    this.#normalize(state, now);
    if (state.failures.length + state.pending.size >= this.policy.maxAttempts) return null;

    const token = Symbol(key);
    state.pending.set(token, now);
    let completed = false;
    const finish = (failed: boolean) => {
      if (completed) return;
      completed = true;
      const current = this.#states.get(key);
      if (!current || !current.pending.delete(token)) return;
      const finishedAt = this.#now();
      this.#normalize(current, finishedAt);
      if (failed) current.failures.push(finishedAt);
      if (current.failures.length === 0 && current.pending.size === 0) this.#states.delete(key);
    };
    return { commitFailure: () => finish(true), release: () => finish(false) };
  }
}
