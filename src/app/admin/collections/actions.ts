"use server";

import { revalidatePath } from "next/cache";
import { requireAdmin } from "@/server/admin-guard";
import { actionError, type ActionResult } from "@/server/action-result";
import {
  createCollection, deleteCollection, removeProductFromCollection, reorderCollectionProducts, setCollectionHero, updateCollection,
} from "@/server/services/admin-collections";
import type { CollectionInput } from "@/lib/validation/admin";

async function run<T>(fn: () => Promise<T>): Promise<ActionResult<T>> {
  try {
    await requireAdmin();
    const data = await fn();
    revalidatePath("/", "layout");
    return { ok: true, data };
  } catch (err) {
    return actionError(err);
  }
}

export async function saveCollectionAction(id: string | null, input: CollectionInput) {
  return run(() => (id ? updateCollection(id, input) : createCollection(input)));
}

export async function deleteCollectionAction(id: string) {
  return run(async () => {
    await deleteCollection(id);
    return null;
  });
}

export async function setCollectionHeroAction(id: string, formData: FormData | null) {
  return run(() => {
    const file = formData?.get("file");
    return setCollectionHero(id, file instanceof File && file.size > 0 ? file : null);
  });
}

export async function reorderCollectionProductsAction(id: string, orderedProductIds: string[]) {
  return run(async () => {
    await reorderCollectionProducts(id, orderedProductIds);
    return null;
  });
}

export async function removeProductFromCollectionAction(id: string, productId: string) {
  return run(async () => {
    await removeProductFromCollection(id, productId);
    return null;
  });
}
