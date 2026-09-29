import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import type { CartView } from "@/server/services/cart";
import { CartLine } from "./cart-line";
import { FreeShippingBar } from "./free-shipping-bar";

export function CartPanel({ cart, variant }: { cart: CartView; variant: "drawer" | "page" }) {
  if (cart.items.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 text-center" data-testid="cart-empty">
        <p className="font-display text-3xl">Your bag is empty</p>
        <p className="text-sm text-text-muted">Fresh drops are one click away.</p>
        <Button render={<Link href="/collections/new-drops" />} nativeButton={false}>Shop new drops</Button>
      </div>
    );
  }
  return (
    <div className={variant === "page" ? "grid gap-10 lg:grid-cols-[1fr_360px]" : "flex flex-1 flex-col"}>
      <ul className="divide-y divide-border" data-testid="cart-lines">
        {cart.items.map((line) => <CartLine key={line.id} line={line} />)}
      </ul>
      <div className={variant === "page" ? "h-fit rounded-md border border-border bg-surface p-6" : "mt-auto border-t border-border pt-4"}>
        <FreeShippingBar subtotalPaise={cart.subtotalPaise} />
        <div className="mt-4 flex items-center justify-between">
          <span className="text-sm text-text-muted">Subtotal ({cart.itemCount} {cart.itemCount === 1 ? "item" : "items"})</span>
          <span className="font-display text-2xl" data-testid="cart-subtotal">{formatPaise(cart.subtotalPaise)}</span>
        </div>
        <p className="mt-1 text-xs text-text-muted">Taxes included. Shipping calculated at checkout.</p>
        <Button render={<Link href="/checkout" />} nativeButton={false} size="lg" className="mt-4 w-full font-display text-lg tracking-wide">
          Checkout
        </Button>
        {variant === "drawer" && (
          <Link href="/cart" className="mt-3 block text-center text-sm text-text-muted underline-offset-4 hover:underline">View full bag</Link>
        )}
      </div>
    </div>
  );
}
