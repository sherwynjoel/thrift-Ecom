import { z } from "zod";
import { cartHandle, ok, parseJson } from "@/server/api";
import { addItem, MAX_QTY_PER_LINE } from "@/server/services/cart";

const addSchema = z.object({
  variantId: z.string().min(1, "variantId is required"),
  quantity: z.number().int().min(1).max(MAX_QTY_PER_LINE).optional(),
});

export const POST = cartHandle(async (req, _ctx, { ref }) => {
  const body = await parseJson(req, addSchema);
  return ok(await addItem(ref, body.variantId, body.quantity ?? 1));
});
