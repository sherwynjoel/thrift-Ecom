"use server";

import { rateLimit } from "@/server/rate-limit";
import { requestIp } from "@/server/request-ip";
import { DomainError } from "@/server/errors";
import { subscribe, SUBSCRIBE_SOURCES, type SubscribeSource } from "@/server/services/subscribers";

export type SubscribeResult = { ok: true } | { ok: false; error: string };

export async function subscribeAction(email: string, source: SubscribeSource): Promise<SubscribeResult> {
  if (!SUBSCRIBE_SOURCES.includes(source)) return { ok: false, error: "Something went wrong. Try again." };
  if (!rateLimit(`subscribe:${await requestIp()}`, 10, 60_000).ok) return { ok: false, error: "Too many tries. Wait a minute and try again." };
  try {
    await subscribe(email, source);
    return { ok: true };
  } catch (err) {
    if (err instanceof DomainError) return { ok: false, error: "Enter a valid email" };
    throw err;
  }
}
