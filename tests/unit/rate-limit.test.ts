import { describe, expect, it } from "vitest";
import { rateLimit } from "@/server/rate-limit";

describe("rateLimit", () => {
  it("allows up to the limit inside the window then blocks", () => {
    const key = `k-${Math.random()}`;
    for (let i = 0; i < 3; i++) expect(rateLimit(key, 3, 60_000).ok).toBe(true);
    const blocked = rateLimit(key, 3, 60_000);
    expect(blocked.ok).toBe(false);
    expect(blocked.retryAfterSec).toBeGreaterThan(0);
  });

  it("evicts only the oldest key once MAX_KEYS distinct keys are tracked, keeping other recent keys intact", () => {
    const prefix = `evict-${Math.random()}-`;
    const firstKey = `${prefix}first`;
    // firstKey is (one of) the oldest tracked keys at the start of this test.
    expect(rateLimit(firstKey, 1, 60_000).ok).toBe(true);
    let midKey = "";
    let lastKey = "";
    for (let i = 1; i <= 10_001; i++) {
      const key = `${prefix}${i}`;
      rateLimit(key, 1, 60_000);
      if (i === 5000) midKey = key;
      lastKey = key;
    }
    // firstKey was among the oldest handful of tracked keys and should have been evicted:
    // a fresh window means it is allowed again. (A naive "clear everything past MAX_KEYS"
    // implementation would also allow this, so this assertion alone is not conclusive.)
    expect(rateLimit(firstKey, 1, 60_000).ok).toBe(true);
    // midKey was inserted long before the map ever exceeded MAX_KEYS and is nowhere near the
    // oldest end, so correct single-key eviction must never have touched it: its earlier hit
    // should still count against its limit of 1. A "clear everything" implementation would have
    // wiped it too, wrongly allowing this call.
    expect(rateLimit(midKey, 1, 60_000).ok).toBe(false);
    // The most recently inserted key was never at risk of eviction either.
    expect(rateLimit(lastKey, 1, 60_000).ok).toBe(false);
  });
});
