import { handle, ok, parseJson, requireApiUser } from "@/server/api";
import { RateLimitedError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { confirmClientPayment, verifyPaymentSchema } from "@/server/services/checkout";

export const POST = handle(async (req) => {
  const user = await requireApiUser(req);
  const rl = rateLimit(`verify:${user.id}`, 20, 60_000);
  if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
  return ok(await confirmClientPayment(user.id, await parseJson(req, verifyPaymentSchema)));
});
