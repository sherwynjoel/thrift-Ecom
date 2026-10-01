"use server";

import { revalidatePath } from "next/cache";
import { actionError, type ActionResult } from "@/server/action-result";
import { ValidationError } from "@/server/errors";
import { requireUserId } from "@/server/session-user";
import { addToWishlist, removeFromWishlist } from "@/server/services/wishlist";

export async function toggleWishlistAction(productId: string, on: boolean): Promise<ActionResult<{ wishlisted: boolean }>> {
  try {
    const userId = await requireUserId();
    if (typeof productId !== "string" || productId.length === 0 || productId.length > 64) throw new ValidationError({ productId: ["Unknown product"] });
    if (on) await addToWishlist(userId, productId);
    else await removeFromWishlist(userId, productId);
    revalidatePath("/account/wishlist");
    return { ok: true, data: { wishlisted: on } };
  } catch (err) {
    return actionError(err);
  }
}
