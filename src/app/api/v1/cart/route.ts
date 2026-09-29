import { handle, ok, resolveApiCartRef, withCartToken } from "@/server/api";
import { getCart } from "@/server/services/cart";

export const GET = handle(async (req) => {
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  return withCartToken(ok(await getCart(ref)), newGuestToken);
});
