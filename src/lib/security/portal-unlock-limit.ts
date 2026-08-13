import { BoundedFailureWindow } from "./failure-window";

type Options = Readonly<{
  now?: () => number;
  maxFailures?: number;
  clientMaxFailures?: number;
  networkMaxFailures?: number;
  windowMs?: number;
  maxKeys?: number;
}>;

export type PortalUnlockDecision = Readonly<{
  allowed: boolean;
  retryAfterMs: number;
  dimension: "NONE" | "CLIENT" | "NETWORK";
}>;

export class PortalUnlockLimiter {
  readonly #clients: BoundedFailureWindow;
  readonly #networks: BoundedFailureWindow;

  constructor(options: Options = {}) {
    const windowMs = options.windowMs ?? 10 * 60_000;
    this.#clients = new BoundedFailureWindow({
      maxFailures: options.clientMaxFailures ?? options.maxFailures ?? 5,
      windowMs,
      idleTtlMs: windowMs,
      maxKeys: options.maxKeys ?? 4_096,
    }, options.now);
    this.#networks = new BoundedFailureWindow({
      maxFailures: options.networkMaxFailures ?? options.maxFailures ?? 100,
      windowMs,
      idleTtlMs: windowMs,
      maxKeys: options.maxKeys ?? 1_024,
    }, options.now);
  }

  check(clientKey: string, networkKey: string): PortalUnlockDecision {
    const client = this.#clients.check(clientKey);
    if (client.locked) {
      return { allowed: false, retryAfterMs: client.retryAfterMs, dimension: "CLIENT" };
    }
    const network = this.#networks.check(networkKey);
    if (network.locked) {
      return { allowed: false, retryAfterMs: network.retryAfterMs, dimension: "NETWORK" };
    }
    return { allowed: true, retryAfterMs: 0, dimension: "NONE" };
  }

  recordFailure(clientKey: string, networkKey: string): PortalUnlockDecision {
    const before = this.check(clientKey, networkKey);
    if (!before.allowed) return before;
    const client = this.#clients.recordFailure(clientKey);
    const network = this.#networks.recordFailure(networkKey);
    if (client.locked) return { allowed: false, retryAfterMs: client.retryAfterMs, dimension: "CLIENT" };
    if (network.locked) return { allowed: false, retryAfterMs: network.retryAfterMs, dimension: "NETWORK" };
    return { allowed: true, retryAfterMs: 0, dimension: "NONE" };
  }

  clearClient(clientKey: string): void {
    this.#clients.clear(clientKey);
  }
}
