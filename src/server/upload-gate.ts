import { ServiceUnavailableError } from "@/server/errors";

// ponytail: per-process in-memory semaphore — correct for one app instance behind one reverse
// proxy (the EC2 box this runs on today). Swap for a shared queue (e.g. Redis) if the app ever
// runs as more than one instance, or this gate stops being a real limit on total memory use.

const MAX_CONCURRENT = 2;
const MAX_WAIT_MS = 30_000;

let active = 0;
const queue: (() => void)[] = [];

/**
 * Bounds how many design uploads (Fabric canvas exports, up to 90 MB each) are decoded and
 * stored at once, so a burst of uploads can't exhaust memory on a small instance. Runs `fn` once
 * a slot is free; a request still queued after 30s is rejected with a 503 + Retry-After so the
 * client can retry instead of the connection hanging indefinitely.
 */
export async function withUploadGate<T>(fn: () => Promise<T>): Promise<T> {
  await acquire();
  try {
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
