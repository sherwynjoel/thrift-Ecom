import { handle, ok, requireApiUser } from "@/server/api";
import { removeFromWishlist } from "@/server/services/wishlist";

export const DELETE = handle(async (req, ctx) => {
  const user = await requireApiUser(req);
  const { productId } = await ctx.params;
  await removeFromWishlist(user.id, productId);
  return ok(null);
});
