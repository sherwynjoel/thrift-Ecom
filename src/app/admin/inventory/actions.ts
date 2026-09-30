"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import { setVariantStock, type InventoryRow } from "@/server/services/admin-inventory";

/** `expectedStock` is the value the admin had on screen; the change is applied as a delta against it (see setVariantStock). */
export async function setStockAction(variantId: string, stock: number, expectedStock?: number): Promise<ActionResult<InventoryRow>> {
  try {
    await requireAdmin();
    const row = await setVariantStock(variantId, stock, expectedStock);
    revalidatePath("/", "layout");
    return { ok: true, data: row };
  } catch (err) {
    return actionError(err);
  }
}
