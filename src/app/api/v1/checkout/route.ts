import { handle, ok, parseJson, requireApiUser } from "@/server/api";
import { RateLimitedError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { getCheckoutView } from "@/server/services/checkout";
import { placeOrder, placeOrderSchema } from "@/server/services/orders";

export const GET = handle(async (req) => {
  const user = await requireApiUser(req);
  return ok(await getCheckoutView(user.id, req.nextUrl.searchParams.get("coupon")));
});

export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  const rl = rateLimit(`place-order:${user.id}`, 10, 60_000);
  if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
  return ok(await placeOrder(user.id, await parseJson(req, placeOrderSchema)), { status: 201 });
});
