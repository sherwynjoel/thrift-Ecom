"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import { createCoupon, deleteCoupon, updateCoupon } from "@/server/services/admin-promotions";
import type { CouponInput } from "@/lib/validation/promotions";

export async function saveCouponAction(id: string | null, input: CouponInput): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin();
    const saved = id ? await updateCoupon(id, input) : await createCoupon(input);
    revalidatePath("/", "layout");
    return { ok: true, data: { id: saved.id } };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteCouponAction(id: string): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    await deleteCoupon(id);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}
