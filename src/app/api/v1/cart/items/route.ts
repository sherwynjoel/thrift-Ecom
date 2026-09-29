import { z } from "zod";
import { handle, ok, parseJson, resolveApiCartRef, withCartToken } from "@/server/api";
import { addItem, MAX_QTY_PER_LINE } from "@/server/services/cart";

const addSchema = z.object({
  variantId: z.string().min(1, "variantId is required"),
  quantity: z.number().int().min(1).max(MAX_QTY_PER_LINE).optional(),
});

export const POST = handle(async (req) => {
  const body = await parseJson(req, addSchema);
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  return withCartToken(ok(await addItem(ref, body.variantId, body.quantity ?? 1)), newGuestToken);
});
