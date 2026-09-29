import { z } from "zod";
import { cartHandle, ok, parseJson } from "@/server/api";
import { MAX_QTY_PER_LINE, removeItem, updateItem } from "@/server/services/cart";

const patchSchema = z.object({ quantity: z.number().int().min(0).max(MAX_QTY_PER_LINE) });

export const PATCH = cartHandle(async (req, ctx, { ref }) => {
  const { id } = await ctx.params;
  const body = await parseJson(req, patchSchema);
  return ok(await updateItem(ref, id, body.quantity));
});

export const DELETE = cartHandle(async (_req, ctx, { ref }) => {
  const { id } = await ctx.params;
  return ok(await removeItem(ref, id));
});
