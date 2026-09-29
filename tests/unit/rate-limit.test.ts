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
});
