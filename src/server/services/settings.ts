import { Prisma, type StoreSetting } from "@prisma/client";
import { BRAND } from "@/config/brand";
import { db } from "@/server/db";
import { zodFieldErrors } from "@/server/action-result";
import { ValidationError } from "@/server/errors";
import { settingsInputSchema } from "@/lib/validation/settings";

export type StoreSettings = StoreSetting;

const DEFAULTS = { id: 1, sellerName: BRAND.name, freeShippingThresholdPaise: BRAND.freeShippingThresholdPaise };

export async function getSettings(): Promise<StoreSettings> {
  // Cheap read on the hot path; only fall through to the write when the singleton hasn't been created yet.
  const existing = await db.storeSetting.findUnique({ where: { id: 1 } });
  if (existing) return existing;
  try {
    return await db.storeSetting.upsert({ where: { id: 1 }, update: {}, create: DEFAULTS });
  } catch (err) {
    // Two first requests racing the lazy create: the loser reads the winner's row.
    if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
      return db.storeSetting.findUniqueOrThrow({ where: { id: 1 } });
    }
    throw err;
  }
}

export async function updateSettings(input: unknown): Promise<StoreSettings> {
  const parsed = settingsInputSchema.safeParse(input);
  if (!parsed.success) throw new ValidationError(zodFieldErrors(parsed.error));
  await getSettings();
  return db.storeSetting.update({ where: { id: 1 }, data: parsed.data });
}
