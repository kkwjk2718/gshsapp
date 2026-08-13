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

// bcryptjs executes CPU-heavy chunks on the application event loop. Rejecting
// excess anonymous work is safer than queuing an attacker-controlled backlog.
export const credentialVerificationGate = new BoundedConcurrencyGate(8);
