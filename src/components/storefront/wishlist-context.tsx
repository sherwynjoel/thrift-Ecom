"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { toast } from "sonner";
import { toggleWishlistAction } from "@/app/(storefront)/account/wishlist/actions";

interface WishlistApi {
  loggedIn: boolean;
  has(productId: string): boolean;
  /** Optimistic toggle; resolves to the new state, or null when the server refused (state reverted, error toasted). */
  toggle(productId: string): Promise<boolean | null>;
}

const GUEST: WishlistApi = { loggedIn: false, has: () => false, toggle: async () => null };
const Ctx = createContext<WishlistApi>(GUEST);

export function WishlistProvider({ loggedIn, initialIds, children }: { loggedIn: boolean; initialIds: string[]; children: React.ReactNode }) {
  const [ids, setIds] = useState(() => new Set(initialIds));
  const flip = (productId: string, on: boolean) =>
    setIds((prev) => {
      const next = new Set(prev);
      if (on) next.add(productId);
      else next.delete(productId);
      return next;
    });
  const toggle = useCallback(async (productId: string) => {
    const on = !ids.has(productId);
    flip(productId, on);
    const r = await toggleWishlistAction(productId, on);
    if (!r.ok) {
      flip(productId, !on);
      toast.error(r.message);
      return null;
    }
    return on;
  }, [ids]);
  const api = useMemo<WishlistApi>(() => ({ loggedIn, has: (id) => ids.has(id), toggle }), [loggedIn, ids, toggle]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useWishlist(): WishlistApi {
  return useContext(Ctx);
}
