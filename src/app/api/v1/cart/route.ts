import { cartHandle, ok } from "@/server/api";
import { getCart } from "@/server/services/cart";

export const GET = cartHandle(async (_req, _ctx, { ref }) => ok(await getCart(ref)));
