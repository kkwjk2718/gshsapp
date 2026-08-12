import { BoundedFailureWindow } from "./failure-window";

type Options = Readonly<{
  now?: () => number;
  maxFailures?: number;
  windowMs?: number;
  maxKeys?: number;
}>;

export type PortalUnlockDecision = Readonly<{
  allowed: boolean;
  retryAfterMs: number;
  dimension: "NONE" | "CLIENT" | "NETWORK" | "CAPACITY";
}>;

export class PortalUnlockLimiter {
  readonly #clients: BoundedFailureWindow;
  readonly #networks: BoundedFailureWindow;

  constructor(options: Options = {}) {
    const windowMs = options.windowMs ?? 10 * 60_000;
    const policy = {
      maxFailures: options.maxFailures ?? 5,
      windowMs,
      idleTtlMs: windowMs,
      maxKeys: options.maxKeys ?? 4_096,
    };
    this.#clients = new BoundedFailureWindow(policy, options.now);
    this.#networks = new BoundedFailureWindow(policy, options.now);
  }

  check(clientKey: string, networkKey: string): PortalUnlockDecision {
    const client = this.#clients.check(clientKey);
    if (client.locked) {
      return { allowed: false, retryAfterMs: client.retryAfterMs, dimension: client.reason === "CAPACITY" ? "CAPACITY" : "CLIENT" };
    }
    const network = this.#networks.check(networkKey);
    if (network.locked) {
      return { allowed: false, retryAfterMs: network.retryAfterMs, dimension: network.reason === "CAPACITY" ? "CAPACITY" : "NETWORK" };
    }
    return { allowed: true, retryAfterMs: 0, dimension: "NONE" };
  }

  recordFailure(clientKey: string, networkKey: string): PortalUnlockDecision {
    const before = this.check(clientKey, networkKey);
    if (!before.allowed) return before;
    const client = this.#clients.recordFailure(clientKey);
    const network = this.#networks.recordFailure(networkKey);
    if (client.reason === "CAPACITY" || network.reason === "CAPACITY") {
      return { allowed: false, retryAfterMs: Math.max(client.retryAfterMs, network.retryAfterMs), dimension: "CAPACITY" };
    }
    if (client.locked) return { allowed: false, retryAfterMs: client.retryAfterMs, dimension: "CLIENT" };
    if (network.locked) return { allowed: false, retryAfterMs: network.retryAfterMs, dimension: "NETWORK" };
    return { allowed: true, retryAfterMs: 0, dimension: "NONE" };
  }

  clearClient(clientKey: string): void {
    this.#clients.clear(clientKey);
  }
}
