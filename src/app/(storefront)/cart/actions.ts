"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { actionError, type ActionResult } from "@/server/action-result";
import { resolveCartRef } from "@/server/cart-ref";
import { addItem, MAX_QTY_PER_LINE, removeItem, updateItem, type CartView } from "@/server/services/cart";
import { ValidationError } from "@/server/errors";

const addSchema = z.object({ variantId: z.string().min(1), quantity: z.number().int().min(1).max(MAX_QTY_PER_LINE) });

export async function addToCartAction(input: { variantId: string; quantity: number }): Promise<ActionResult<CartView>> {
  try {
    const parsed = addSchema.safeParse(input);
    if (!parsed.success) throw new ValidationError({ quantity: ["Choose a quantity between 1 and 10"] });
    const ref = await resolveCartRef({ create: true });
    const cart = await addItem(ref, parsed.data.variantId, parsed.data.quantity);
    revalidatePath("/", "layout");
    return { ok: true, data: cart };
  } catch (err) {
    return actionError(err);
  }
}

export async function updateCartItemAction(itemId: string, quantity: number): Promise<ActionResult<CartView>> {
  try {
    const ref = await resolveCartRef({ create: true });
    const cart = await updateItem(ref, itemId, quantity);
    revalidatePath("/", "layout");
    return { ok: true, data: cart };
  } catch (err) {
    return actionError(err);
  }
}

export async function removeCartItemAction(itemId: string): Promise<ActionResult<CartView>> {
  try {
    const ref = await resolveCartRef({ create: true });
    const cart = await removeItem(ref, itemId);
    revalidatePath("/", "layout");
    return { ok: true, data: cart };
  } catch (err) {
    return actionError(err);
  }
}
