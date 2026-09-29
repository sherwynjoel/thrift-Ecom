import { NextResponse, type NextRequest } from "next/server";
import type { ZodType } from "zod";
import { randomBytes } from "node:crypto";
import { RateLimitedError, toHttp, UnauthorizedError, ValidationError } from "@/server/errors";
import { verifyApiToken } from "@/server/api-token";
import { getUserById, type PublicUser } from "@/server/services/auth";
import type { CartRef } from "@/server/services/cart";
import { CART_COOKIE } from "@/server/cart-cookie";

export const CART_TOKEN_HEADER = "X-Cart-Token";
export type RouteCtx = { params: Promise<Record<string, string>> };

export function ok<T>(data: T, init?: ResponseInit): Response {
  return NextResponse.json({ data }, init);
}

/** Nearest-hop client IP. Trusts the LAST x-forwarded-for entry (set by our own reverse proxy), then x-real-ip. */
export function clientIp(req: NextRequest): string {
  const xff = req.headers.get("x-forwarded-for");
  if (xff) {
    const parts = xff.split(",").map((s) => s.trim()).filter(Boolean);
    if (parts.length) return parts[parts.length - 1];
  }
  return req.headers.get("x-real-ip")?.trim() || "local";
}

function errorResponse(err: unknown): Response {
  const { status, body } = toHttp(err);
  const res = NextResponse.json(body, { status });
  if (err instanceof RateLimitedError) res.headers.set("Retry-After", String(err.retryAfterSec));
  return res;
}

export function handle(fn: (req: NextRequest, ctx: RouteCtx) => Promise<Response>) {
  return async (req: NextRequest, ctx: RouteCtx): Promise<Response> => {
    try {
      return await fn(req, ctx);
    } catch (err) {
      return errorResponse(err);
    }
  };
}

export function cartHandle(
  fn: (req: NextRequest, ctx: RouteCtx, cart: { ref: CartRef }) => Promise<Response>,
) {
  return async (req: NextRequest, ctx: RouteCtx): Promise<Response> => {
    const { ref, newGuestToken } = await resolveApiCartRef(req);
    try {
      return withCartToken(await fn(req, ctx, { ref }), newGuestToken);
    } catch (err) {
      return withCartToken(errorResponse(err), newGuestToken);
    }
  };
}

export async function parseJson<T>(req: NextRequest, schema: ZodType<T>): Promise<T> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    throw new ValidationError({ body: ["Expected a JSON body"] });
  }
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    const fields: Record<string, string[]> = {};
    for (const issue of parsed.error.issues) {
      const k = issue.path.join(".") || "body";
      (fields[k] ??= []).push(issue.message);
    }
    throw new ValidationError(fields);
  }
  return parsed.data;
}

export async function getApiUser(req: NextRequest): Promise<PublicUser | null> {
  const header = req.headers.get("authorization");
  if (header?.toLowerCase().startsWith("bearer ")) {
    const claims = await verifyApiToken(header.slice(7).trim());
    return claims ? getUserById(claims.id) : null;
  }
  try {
    const { auth } = await import("@/server/auth");
    const session = await auth();
    return session?.user?.id ? getUserById(session.user.id) : null;
  } catch {
    return null;
  }
}

export async function requireApiUser(req: NextRequest): Promise<PublicUser> {
  const user = await getApiUser(req);
  if (!user) throw new UnauthorizedError();
  return user;
}

export async function resolveApiCartRef(req: NextRequest): Promise<{ ref: CartRef; newGuestToken: string | null }> {
  const user = await getApiUser(req);
  if (user) return { ref: { userId: user.id }, newGuestToken: null };
  const fromHeader = req.headers.get(CART_TOKEN_HEADER);
  if (fromHeader) return { ref: { guestToken: fromHeader }, newGuestToken: null };
  const fromCookie = req.cookies.get(CART_COOKIE)?.value;
  if (fromCookie) return { ref: { guestToken: fromCookie }, newGuestToken: null };
  const token = randomBytes(24).toString("base64url");
  return { ref: { guestToken: token }, newGuestToken: token };
}

export function withCartToken(res: Response, token: string | null): Response {
  if (token) res.headers.set(CART_TOKEN_HEADER, token);
  return res;
}
