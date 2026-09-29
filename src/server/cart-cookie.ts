import { cookies } from "next/headers";
import { randomBytes } from "node:crypto";

export const CART_COOKIE = "cart_token";
const ONE_YEAR = 60 * 60 * 24 * 365;

export async function readGuestToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(CART_COOKIE)?.value ?? null;
}

/** Only call from a server action or route handler: setting cookies during render throws. */
export async function ensureGuestToken(): Promise<string> {
  const store = await cookies();
  const current = store.get(CART_COOKIE)?.value;
  if (current) return current;
  const token = randomBytes(24).toString("base64url");
  store.set(CART_COOKIE, token, { httpOnly: true, sameSite: "lax", path: "/", maxAge: ONE_YEAR, secure: process.env.NODE_ENV === "production" });
  return token;
}

export async function clearGuestToken(): Promise<void> {
  const store = await cookies();
  store.delete(CART_COOKIE);
}
