import { z } from "zod";
import { handle, ok, parseJson, requireApiUser } from "@/server/api";
import { addToWishlist, listWishlist } from "@/server/services/wishlist";

const bodySchema = z.object({ productId: z.string().trim().min(1).max(64) });

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  return ok({ items: await listWishlist(user.id) });
});

export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  const { productId } = await parseJson(req, bodySchema);
  const result = await addToWishlist(user.id, productId);
  return ok(result, { status: result.added ? 201 : 200 });
});
