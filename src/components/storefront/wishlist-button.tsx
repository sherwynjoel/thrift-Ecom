"use client";

import { Heart } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useWishlist } from "./wishlist-context";

export function WishlistButton({ productId, productName, className }: { productId: string; productName: string; className?: string }) {
  const wishlist = useWishlist();
  const router = useRouter();
  const pathname = usePathname();
  const [busy, setBusy] = useState(false);
  const on = wishlist.has(productId);

  const click = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!wishlist.loggedIn) {
      toast("Log in to save favourites");
      router.push(`/login?next=${encodeURIComponent(pathname)}`);
      return;
    }
    setBusy(true);
    const result = await wishlist.toggle(productId);
    setBusy(false);
    if (result !== null) toast.success(result ? "Saved to your wishlist" : "Removed from your wishlist");
  };

  return (
    <button
      type="button"
      onClick={click}
      disabled={busy}
      aria-pressed={on}
      aria-label={on ? `Remove ${productName} from wishlist` : `Save ${productName} to wishlist`}
      className={cn("inline-flex size-11 items-center justify-center rounded-full transition-colors disabled:opacity-60", className)}
      data-testid="wishlist-button"
    >
      <Heart className={cn("size-5", on && "fill-current text-brand")} aria-hidden="true" />
    </button>
  );
}
