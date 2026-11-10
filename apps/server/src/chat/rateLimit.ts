/** ponytail: in-memory token bucket per user id. Ceiling = one Render instance. Upgrade: Redis. */

export type TokenBucket = {
  take(id: string, now?: number): boolean;
};

export function createTokenBucket(opts: {
  capacity: number;
  refillPerMs: number;
}): TokenBucket {
  const buckets = new Map<string, { tokens: number; at: number }>();
  return {
    take(id: string, now = Date.now()): boolean {
      const prev = buckets.get(id) ?? { tokens: opts.capacity, at: now };
      const elapsed = Math.max(0, now - prev.at);
      const tokens = Math.min(opts.capacity, prev.tokens + elapsed * opts.refillPerMs);
      if (tokens < 1) {
        buckets.set(id, { tokens, at: now });
        return false;
      }
      buckets.set(id, { tokens: tokens - 1, at: now });
      return true;
    },
  };
}

/** 20 translations / user / 10 minutes, burst 8. */
export const TRANSLATION_BUCKET = createTokenBucket({
  capacity: 8,
  refillPerMs: 20 / (10 * 60 * 1000),
});
