import { auth } from "@/server/auth";
import { ensureGuestToken, readGuestToken } from "@/server/cart-cookie";
import { EMPTY_CART, getCart, type CartRef, type CartView } from "@/server/services/cart";

export function resolveCartRef(opts: { create: true }): Promise<CartRef>;
export function resolveCartRef(opts: { create: false }): Promise<CartRef | null>;
export async function resolveCartRef(opts: { create: boolean }): Promise<CartRef | null> {
  const session = await auth();
  if (session?.user?.id) return { userId: session.user.id };
  const token = opts.create ? await ensureGuestToken() : await readGuestToken();
  return token ? { guestToken: token } : null;
}

/** Cart for the current request without creating a guest cookie (safe during render). */
export async function getCurrentCart(): Promise<CartView> {
  const ref = await resolveCartRef({ create: false });
  return ref ? getCart(ref) : EMPTY_CART;
}
