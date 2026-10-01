import { db } from "@/server/db";

export interface Health { ok: boolean; db: "up" | "down"; version: string; uptimeSec: number; time: string }

let inFlight: Promise<boolean> | null = null;
let lastUp: boolean | null = null;

/**
 * Runs the actual `SELECT 1`, shared by any `checkHealth()` calls that overlap it (a reverse
 * proxy probing every few seconds should never stack more than one query on the connection pool),
 * and logs only when the up/down state actually changes, not on every repeated probe.
 */
function probeDb(timeoutMs: number): Promise<boolean> {
  if (inFlight) return inFlight;
  inFlight = (async () => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let up: boolean;
    try {
      await Promise.race([
        db.$queryRaw`SELECT 1`,
        new Promise((_, reject) => {
          timer = setTimeout(() => reject(new Error(`database did not answer within ${timeoutMs} ms`)), timeoutMs);
        }),
      ]);
      up = true;
    } catch (err) {
      up = false;
      if (lastUp !== false) console.error("[health] database check failed", err);
    } finally {
      if (timer) clearTimeout(timer);
    }
    if (up && lastUp === false) console.log("[health] database back up");
    lastUp = up;
    return up;
  })();
  inFlight.finally(() => { inFlight = null; });
  return inFlight;
}

export async function checkHealth(timeoutMs = 2000): Promise<Health> {
  const up = await probeDb(timeoutMs);
  return { ok: up, db: up ? "up" : "down", version: process.env.APP_VERSION || "dev", uptimeSec: Math.round(process.uptime()), time: new Date().toISOString() };
}
