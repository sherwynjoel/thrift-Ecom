import { z } from "zod";
import { db } from "@/server/db";
import { ValidationError } from "@/server/errors";
import { toCsv } from "@/lib/csv";
import { formatDateIst } from "@/lib/dates";

export const SUBSCRIBE_SOURCES = ["newsletter", "studio"] as const;
export type SubscribeSource = (typeof SUBSCRIBE_SOURCES)[number];

const emailSchema = z.string().trim().toLowerCase().email("Enter a valid email").max(254);

/** Idempotent: signing up twice from the same form is a no-op, not an error. */
export async function subscribe(rawEmail: unknown, source: SubscribeSource): Promise<void> {
  const parsed = emailSchema.safeParse(rawEmail);
  if (!parsed.success) throw new ValidationError({ email: parsed.error.issues.map((i) => i.message) });
  await db.subscriber.upsert({ where: { email_source: { email: parsed.data, source } }, create: { email: parsed.data, source }, update: {} });
}

export async function countSubscribers(): Promise<number> {
  return db.subscriber.count();
}

export async function exportSubscribersCsv(): Promise<string> {
  const rows = await db.subscriber.findMany({ orderBy: { createdAt: "desc" }, take: 50_000 });
  return toCsv([["Email", "Signed up from", "Date"], ...rows.map((r) => [r.email, r.source === "studio" ? "Design studio (notify me)" : "Newsletter", formatDateIst(r.createdAt)])]);
}
