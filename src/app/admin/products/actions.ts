"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import { createProduct, deleteProduct, updateProduct } from "@/server/services/admin-products";
import type { ProductInput } from "@/lib/validation/admin";

export async function saveProductAction(id: string | null, input: ProductInput): Promise<ActionResult<{ id: string; slug: string }>> {
  try {
    await requireAdmin();
    const saved = id ? await updateProduct(id, input) : await createProduct(input);
    revalidatePath("/", "layout");
    return { ok: true, data: saved };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteProductAction(id: string): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    await deleteProduct(id);
    revalidatePath("/", "layout");
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}
