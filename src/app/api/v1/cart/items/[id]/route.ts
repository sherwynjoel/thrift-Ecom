import { z } from "zod";
import { handle, ok, parseJson, resolveApiCartRef, withCartToken } from "@/server/api";
import { MAX_QTY_PER_LINE, removeItem, updateItem } from "@/server/services/cart";

const patchSchema = z.object({ quantity: z.number().int().min(0).max(MAX_QTY_PER_LINE) });

export const PATCH = handle(async (req, ctx) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  return withCartToken(ok(await updateItem(ref, id, body.quantity)), newGuestToken);
});

export const DELETE = handle(async (req, ctx) => {
  const { id } = await ctx.params;
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  return withCartToken(ok(await removeItem(ref, id)), newGuestToken);
});
