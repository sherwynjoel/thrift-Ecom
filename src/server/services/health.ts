import { db } from "@/server/db";

export interface Health { ok: boolean; db: "up" | "down"; version: string; uptimeSec: number; time: string }

export async function checkHealth(timeoutMs = 2000): Promise<Health> {
  let up = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      db.$queryRaw`SELECT 1`,
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(new Error(`database did not answer within ${timeoutMs} ms`)), timeoutMs);
      }),
    ]);
    up = true;
  } catch (err) {
    console.error("[health] database check failed", err);
  } finally {
    if (timer) clearTimeout(timer);
  }
  return { ok: up, db: up ? "up" : "down", version: process.env.APP_VERSION || "dev", uptimeSec: Math.round(process.uptime()), time: new Date().toISOString() };
}
