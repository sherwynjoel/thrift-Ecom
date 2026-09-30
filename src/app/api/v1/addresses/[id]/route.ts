import { z } from "zod";
import { handle, ok, parseJson, requireApiUser } from "@/server/api";
import { deleteAddress, updateAddress } from "@/server/services/addresses";

const anyObject = z.object({}).passthrough();

export const PATCH = handle(async (req, ctx) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  return ok(await updateAddress(user.id, id, await parseJson(req, anyObject)));
});

export const DELETE = handle(async (req, ctx) => {
  const user = await requireApiUser(req);
  const { id } = await ctx.params;
  await deleteAddress(user.id, id);
  return ok({ deleted: true });
});
