export class BoundedKeyedLockError extends Error {
  constructor(readonly code: "CAPACITY" | "QUEUE_FULL") {
    super(code);
    this.name = "BoundedKeyedLockError";
  }
}

type State = {
  locked: boolean;
  waiters: Array<() => void>;
};

export class BoundedKeyedLock {
  readonly #states = new Map<string, State>();
  #totalWaiters = 0;

  constructor(readonly policy: Readonly<{
    maxKeys: number;
    maxWaitersPerKey: number;
    maxTotalWaiters: number;
  }> = { maxKeys: 4_096, maxWaitersPerKey: 16, maxTotalWaiters: 4_096 }) {
    for (const value of Object.values(policy)) {
      if (!Number.isInteger(value) || value < 1) throw new Error("Invalid keyed lock policy");
    }
  }

  async #acquire(key: string) {
    if (!key || key.length > 256) throw new BoundedKeyedLockError("CAPACITY");
    let state = this.#states.get(key);
    if (!state) {
      if (this.#states.size >= this.policy.maxKeys) throw new BoundedKeyedLockError("CAPACITY");
      state = { locked: false, waiters: [] };
      this.#states.set(key, state);
    }

    if (state.locked) {
      if (state.waiters.length >= this.policy.maxWaitersPerKey || this.#totalWaiters >= this.policy.maxTotalWaiters) {
        throw new BoundedKeyedLockError("QUEUE_FULL");
      }
      this.#totalWaiters += 1;
      await new Promise<void>((resolve) => state!.waiters.push(resolve));
      this.#totalWaiters -= 1;
    } else {
      state.locked = true;
    }

    let released = false;
    return () => {
      if (released) return;
      released = true;
      const current = this.#states.get(key);
      if (!current) return;
      const next = current.waiters.shift();
      if (next) next();
      else {
        current.locked = false;
        this.#states.delete(key);
      }
    };
  }

  async runExclusive<T>(keys: readonly string[], task: () => Promise<T>): Promise<T> {
    const orderedKeys = [...new Set(keys)].sort();
    if (orderedKeys.length === 0 || orderedKeys.length > 2) throw new BoundedKeyedLockError("CAPACITY");
    const releases: Array<() => void> = [];
    try {
      for (const key of orderedKeys) releases.push(await this.#acquire(key));
      return await task();
    } finally {
      for (const release of releases.reverse()) release();
    }
  }

  get size() {
    return this.#states.size;
  }
}

export function securityPrincipalLockKey(scope: string, identifierKey: string) {
  return `${scope}:principal:${identifierKey}`;
}
