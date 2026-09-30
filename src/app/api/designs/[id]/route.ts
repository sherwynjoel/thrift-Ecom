import { clientIp, handle, ok, resolveApiCartRef } from "@/server/api";
import { NotFoundError, RateLimitedError } from "@/server/errors";
import { rateLimit } from "@/server/rate-limit";
import { getDesignForOwner } from "@/server/services/designs";

export const dynamic = "force-dynamic";

export const GET = handle(async (req, ctx) => {
  const rl = rateLimit(`design-read:${clientIp(req)}`, 120, 10 * 60_000);
  if (!rl.ok) throw new RateLimitedError(rl.retryAfterSec);
  const { id } = await ctx.params;
  const { ref, newGuestToken } = await resolveApiCartRef(req);
  if (newGuestToken) throw new NotFoundError("Design"); // a brand-new visitor owns nothing
  return ok(await getDesignForOwner(ref, id));
});
