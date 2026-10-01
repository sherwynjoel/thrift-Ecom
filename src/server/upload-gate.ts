import { ServiceUnavailableError } from "@/server/errors";

// ponytail: per-process in-memory semaphore — correct for one app instance behind one reverse
// proxy (the EC2 box this runs on today). Swap for a shared queue (e.g. Redis) if the app ever
// runs as more than one instance, or this gate stops being a real limit on total memory use.

const MAX_CONCURRENT = 2;
const MAX_WAIT_MS = 30_000;

let active = 0;
const queue: (() => void)[] = [];

/**
 * Bounds how many design uploads (Fabric canvas exports, up to 90 MB each) are read, decoded and
 * stored at once, so a burst of uploads can't exhaust memory on a small instance. `fn` must do the
 * whole thing including reading the request body — call this BEFORE buffering the body, not just
 * around the decode/store step, or a queued request still holds its ~90 MB body in memory while it
 * waits. Runs `fn` once a slot is free; a request still queued after 30s is rejected with a 503 +
 * Retry-After so the client can retry instead of the connection hanging indefinitely. If `signal`
 * is given and has already aborted by the time a slot frees up, `fn` is skipped entirely (the
 * client is gone, so there is nothing to answer).
 */
export async function withUploadGate<T>(fn: () => Promise<T>, signal?: AbortSignal): Promise<T> {
  await acquire();
  try {
    if (signal?.aborted) throw new Error("Upload gate: client disconnected before its turn");
    return await fn();
  } finally {
    release();
  }
}

function acquire(): Promise<void> {
  if (active < MAX_CONCURRENT) {
    active++;
    return Promise.resolve();
  }
  return new Promise((resolve, reject) => {
    const onTurn = () => {
      clearTimeout(timer);
      active++;
      resolve();
    };
    const timer = setTimeout(() => {
      const i = queue.indexOf(onTurn);
      if (i !== -1) queue.splice(i, 1);
      reject(new ServiceUnavailableError(5, "The server is handling too many uploads right now. Please try again in a few seconds."));
    }, MAX_WAIT_MS);
    queue.push(onTurn);
  });
}

function release(): void {
  active--;
  queue.shift()?.();
}
