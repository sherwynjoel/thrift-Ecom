import { describe, expect, it, vi } from "vitest";
import { withUploadGate } from "@/server/upload-gate";
import { ServiceUnavailableError } from "@/server/errors";

/** Runs fn and resolves once withUploadGate has called it but before fn's own result resolves. */
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}

describe("withUploadGate", () => {
  it("runs up to 2 jobs concurrently and queues the rest until a slot frees up", async () => {
    const started: number[] = [];
    const gates = [deferred(), deferred(), deferred()];
    const runs = gates.map((g, i) =>
      withUploadGate(async () => {
        started.push(i);
        await g.promise;
        return i;
      }),
    );
    await Promise.resolve(); // let the first microtask batch of withUploadGate run
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toEqual([0, 1]); // job 2 is queued, not yet started

    gates[0].resolve();
    await expect(runs[0]).resolves.toBe(0);
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toEqual([0, 1, 2]); // freeing a slot lets the queued job start

    gates[1].resolve();
    gates[2].resolve();
    await expect(runs[1]).resolves.toBe(1);
    await expect(runs[2]).resolves.toBe(2);
  });

  it("rejects with a 503 + Retry-After once a queued job waits past the timeout", async () => {
    vi.useFakeTimers();
    try {
      const hold = [deferred(), deferred()];
      const blocking = hold.map((g) => withUploadGate(() => g.promise.then(() => "done")));
      const queued = withUploadGate(async () => "should never run");

      const assertion = expect(queued).rejects.toBeInstanceOf(ServiceUnavailableError);
      await vi.advanceTimersByTimeAsync(30_000);
      await assertion;
      await queued.catch((err: unknown) => {
        expect((err as ServiceUnavailableError).retryAfterSec).toBeGreaterThan(0);
      });

      hold[0].resolve();
      hold[1].resolve();
      await Promise.all(blocking);
    } finally {
      vi.useRealTimers();
    }
  });

  it("releases its slot even when the job throws", async () => {
    await expect(
      withUploadGate(async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    // the failed job's slot must be free again, so two fresh jobs run concurrently without queuing
    const started: number[] = [];
    const gates = [deferred(), deferred()];
    const runs = gates.map((g, i) =>
      withUploadGate(async () => {
        started.push(i);
        await g.promise;
      }),
    );
    await new Promise((r) => setTimeout(r, 10));
    expect(started).toEqual([0, 1]);
    gates[0].resolve();
    gates[1].resolve();
    await Promise.all(runs);
  });
});
