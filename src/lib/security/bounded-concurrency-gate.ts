export type ConcurrencyPermit = Readonly<{ release(): void }>;

export class BoundedConcurrencyGate {
  #active = 0;

  constructor(readonly maxConcurrent: number) {
    if (!Number.isInteger(maxConcurrent) || maxConcurrent < 1) {
      throw new Error("maxConcurrent must be a positive integer");
    }
  }

  tryAcquire(): ConcurrencyPermit | null {
    if (this.#active >= this.maxConcurrent) return null;
    this.#active += 1;
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        this.#active -= 1;
      },
    };
  }
}

export class BoundedKeyedConcurrencyGate {
  readonly #active = new Map<string, symbol>();

  constructor(readonly maxKeys: number) {
    if (!Number.isInteger(maxKeys) || maxKeys < 1) throw new Error("maxKeys must be a positive integer");
  }

  tryAcquire(key: string): ConcurrencyPermit | null {
    if (!key || key.length > 256 || this.#active.has(key) || this.#active.size >= this.maxKeys) return null;
    const token = Symbol(key);
    this.#active.set(key, token);
    let released = false;
    return {
      release: () => {
        if (released) return;
        released = true;
        if (this.#active.get(key) === token) this.#active.delete(key);
      },
    };
  }
}

// bcryptjs executes CPU-heavy chunks on the application event loop. Rejecting
// excess anonymous work is safer than queuing an attacker-controlled backlog.
export const credentialVerificationGate = new BoundedConcurrencyGate(8);
export const signupInviteVerificationGate = new BoundedKeyedConcurrencyGate(1_024);
