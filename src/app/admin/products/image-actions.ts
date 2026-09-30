"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import { addProductImages, deleteProductImage, reorderProductImages, updateProductImage } from "@/server/services/admin-images";
import type { AdminImage } from "@/server/services/admin-products";

function done() {
  revalidatePath("/", "layout");
}

export async function uploadProductImagesAction(productId: string, formData: FormData): Promise<ActionResult<AdminImage[]>> {
  try {
    await requireAdmin();
    const files = formData.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
    const added = await addProductImages(productId, files);
    done();
    return { ok: true, data: added };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateProductImageAction(imageId: string, input: { alt: string; colorName: string | null }): Promise<ActionResult<AdminImage>> {
  try {
    await requireAdmin();
    const img = await updateProductImage(imageId, input);
    done();
    return { ok: true, data: img };
  } catch (err) {
    return actionError(err);
  }
}

export async function reorderProductImagesAction(productId: string, orderedIds: string[]): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    await reorderProductImages(productId, orderedIds);
    done();
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}

export async function deleteProductImageAction(imageId: string): Promise<ActionResult<null>> {
  try {
    await requireAdmin();
    await deleteProductImage(imageId);
    done();
    return { ok: true, data: null };
  } catch (err) {
    return actionError(err);
  }
}
