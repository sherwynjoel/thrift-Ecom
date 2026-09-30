import { handle, ok, requireApiUser } from "@/server/api";
import { setDefaultAddress } from "@/server/services/addresses";

export const POST = handle(async (req, ctx) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return ok(await setDefaultAddress(user.id, id));
});
