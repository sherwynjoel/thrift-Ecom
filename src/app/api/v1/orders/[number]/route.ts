import { handle, ok, requireApiUser } from "@/server/api";
import { getOrderForUser } from "@/server/services/orders";

export const GET = handle(async (req, ctx) => {
  const user = await requireApiUser(req);
  const { number } = await ctx.params;
  return ok(await getOrderForUser(user.id, number));
});
