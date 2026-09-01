type FixedWindowRateLimiterOptions = {
  limit: number;
  windowMs: number;
  maxKeys: number;
};

type FixedWindowEntry = {
  count: number;
  resetAt: number;
};

export class FixedWindowRateLimiter {
  private readonly entries = new Map<string, FixedWindowEntry>();
  private readonly limit: number;
  private readonly windowMs: number;
  private readonly maxKeys: number;

  constructor(options: FixedWindowRateLimiterOptions) {
    this.limit = options.limit;
    this.windowMs = options.windowMs;
    this.maxKeys = options.maxKeys;
  }

  consume(keys: string[], now = Date.now()) {
    for (const [key, entry] of this.entries) {
      if (entry.resetAt <= now) {
        this.entries.delete(key);
      }
    }

    const uniqueKeys = [...new Set(keys)];
    if (uniqueKeys.some((key) => (this.entries.get(key)?.count ?? 0) >= this.limit)) {
      return false;
    }

    const unseenKeyCount = uniqueKeys.filter((key) => !this.entries.has(key)).length;
    if (this.entries.size + unseenKeyCount > this.maxKeys) {
      return false;
    }

    for (const key of uniqueKeys) {
      const existingEntry = this.entries.get(key);
      this.entries.set(key, {
        count: (existingEntry?.count ?? 0) + 1,
        resetAt: existingEntry?.resetAt ?? now + this.windowMs,
      });
    }

    return true;
  }
}
