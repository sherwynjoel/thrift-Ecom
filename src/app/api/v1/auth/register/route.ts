import { handle, ok, parseJson } from "@/server/api";
import { registerSchema } from "@/lib/validation/auth";
import { registerUser } from "@/server/services/auth";
import { signApiToken } from "@/server/api-token";
import { rateLimit } from "@/server/rate-limit";
import { DomainError } from "@/server/errors";

export const POST = handle(async (req) => {
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "local";
  const limit = rateLimit(`register:${ip}`, 20, 60_000);
  if (!limit.ok) throw new DomainError("RATE_LIMITED", "Too many attempts, try again shortly", 429, { retryAfterSec: limit.retryAfterSec });
  const body = await parseJson(req, registerSchema);
  const user = await registerUser(body);
  const token = await signApiToken(user);
  return ok({ user, token }, { status: 201 });
});
