"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import { createOffer, deleteOffer, updateOffer } from "@/server/services/admin-promotions";
import type { OfferInput } from "@/lib/validation/promotions";

export async function saveOfferAction(id: string | null, input: OfferInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const saved = id ? await updateOffer(id, input) : await createOffer(input);
    revalidatePath("/", "layout");
    return { ok: true, data: { id: saved.id } };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteOfferAction(id: string): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    await deleteOffer(id);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}
