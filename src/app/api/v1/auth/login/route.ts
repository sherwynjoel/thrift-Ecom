import { clientIp, handle, ok, parseJson } from "@/server/api";
import { loginSchema } from "@/lib/validation/auth";
import { verifyCredentials } from "@/server/services/auth";
import { signApiToken } from "@/server/api-token";
import { rateLimit } from "@/server/rate-limit";
import { RateLimitedError, UnauthorizedError } from "@/server/errors";

export const POST = handle(async (req) => {
  const limit = rateLimit(`login:${clientIp(req)}`, 60, 60_000);
  if (!limit.ok) throw new RateLimitedError(limit.retryAfterSec);
  const body = await parseJson(req, loginSchema);
  const user = await verifyCredentials(body.email, body.password);
  if (!user) throw new UnauthorizedError("Incorrect email or password");
  const token = await signApiToken(user);
  return ok({ user, token });
});
