import { handle, ok, requireApiUser } from "@/server/api";
import { listOrdersForUser } from "@/server/services/orders";

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  const page = Number(req.nextUrl.searchParams.get("page") ?? "1") || 1;
  return ok(await listOrdersForUser(user.id, { page }));
});
