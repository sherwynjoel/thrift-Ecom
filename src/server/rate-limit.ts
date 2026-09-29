const buckets = new Map<string, number[]>();
const MAX_KEYS = 10_000;

/**
 * In-memory sliding window. Fine for one instance behind one trusted reverse proxy
 * (Caddy on the EC2 box). Swap for Redis if a second instance is added.
 */
export function rateLimit(key: string, limit: number, windowMs: number): { ok: boolean; retryAfterSec: number } {
  const now = Date.now();
  const hits = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (hits.length >= limit) {
    buckets.set(key, hits);
    return { ok: false, retryAfterSec: Math.max(1, Math.ceil((hits[0] + windowMs - now) / 1000)) };
  }
  hits.push(now);
  buckets.delete(key);
  buckets.set(key, hits);
  while (buckets.size > MAX_KEYS) {
    const oldest = buckets.keys().next().value;
    if (oldest === undefined) break;
    buckets.delete(oldest);
  }
  return { ok: true, retryAfterSec: 0 };
}
