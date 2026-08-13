import { BoundedFailureWindow } from "@/lib/security/failure-window";

export class BoundedAttemptAdmission {
  readonly #attempts: BoundedFailureWindow;

  constructor(options: Readonly<{
    maxAttempts: number;
    windowMs: number;
    maxKeys: number;
    now?: () => number;
  }>) {
    this.#attempts = new BoundedFailureWindow({
      maxFailures: options.maxAttempts,
      windowMs: options.windowMs,
      idleTtlMs: options.windowMs,
      maxKeys: options.maxKeys,
    }, options.now);
  }

  // This method is intentionally synchronous: check+reservation is one event-loop
  // critical section and cannot be bypassed by a Promise.all burst.
  admit(key: string | null) {
    if (key === null) return true;
    if (this.#attempts.check(key).locked) return false;
    this.#attempts.recordFailure(key);
    return true;
  }
}
