import { z } from "zod";
import { handle, ok, parseJson, requireApiUser } from "@/server/api";
import { createAddress, listAddresses } from "@/server/services/addresses";

const anyObject = z.object({}).passthrough();

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  return ok(await listAddresses(user.id));
});

export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  return ok(await createAddress(user.id, await parseJson(req, anyObject)), { status: 201 });
});
