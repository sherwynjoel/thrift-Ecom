import { clientIp, handle, ok, parseJson } from "@/server/api";
import { registerSchema } from "@/lib/validation/auth";
import { registerUser } from "@/server/services/auth";
import { signApiToken } from "@/server/api-token";
import { rateLimit } from "@/server/rate-limit";
import { RateLimitedError } from "@/server/errors";

export const POST = handle(async (req) => {
  const limit = rateLimit(`register:${clientIp(req)}`, 20, 60_000);
  if (!limit.ok) throw new RateLimitedError(limit.retryAfterSec);
  const body = await parseJson(req, registerSchema);
  const user = await registerUser(body);
  const token = await signApiToken(user);
  return ok({ user, token }, { status: 201 });
});
