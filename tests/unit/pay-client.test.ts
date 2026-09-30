import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { loadRazorpay } from "@/components/storefront/checkout/pay";

interface FakeScript { src: string; async: boolean; onload: (() => void) | null; onerror: (() => void) | null; remove: () => void; removed: boolean }

describe("loadRazorpay (review M3)", () => {
  let scripts: FakeScript[];

  beforeEach(() => {
    vi.useFakeTimers();
    scripts = [];
    const doc = {
      createElement: () => {
        const s: FakeScript = { src: "", async: false, onload: null, onerror: null, removed: false, remove: () => { s.removed = true; } };
        scripts.push(s);
        return s;
      },
      head: { appendChild: () => undefined },
    };
    vi.stubGlobal("document", doc);
    vi.stubGlobal("window", { setTimeout, clearTimeout });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("gives up on a script that never loads, then lets the next attempt try again", async () => {
    const first = loadRazorpay(15_000);
    const settled = vi.fn();
    first.then(settled, settled);
    await vi.advanceTimersByTimeAsync(14_999);
    expect(settled).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);
    await expect(first).rejects.toThrow(/could not open the payment window/i);
    expect(scripts[0].removed).toBe(true);

    const second = loadRazorpay(15_000);
    expect(scripts).toHaveLength(2);
    scripts[1].onload?.();
    await expect(second).resolves.toBeUndefined();
    await vi.advanceTimersByTimeAsync(20_000);
    await expect(second).resolves.toBeUndefined();
  });
});
