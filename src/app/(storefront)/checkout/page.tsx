import type { Metadata } from "next";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import { getCurrentCart } from "@/server/cart-ref";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const cart = await getCurrentCart();
  return (
    <div className="container-x grid gap-10 py-10 lg:grid-cols-[1fr_360px]">
      <section>
        <h1 className="text-5xl md:text-7xl">Checkout</h1>
        <div className="mt-8 rounded-md border border-dashed border-border bg-surface p-8" data-testid="checkout-placeholder">
          <p className="font-display text-3xl">Payments arrive in the next release</p>
          <p className="mt-2 max-w-md text-text-muted">Address entry, Razorpay, and order confirmation are being wired up. Your bag is saved and will be here when checkout opens.</p>
          <Button render={<Link href="/collections/new-drops" />} nativeButton={false} variant="secondary" className="mt-6">Keep shopping</Button>
        </div>
      </section>
      <aside className="h-fit rounded-md border border-border bg-surface p-6">
        <p className="font-display text-2xl uppercase">Summary</p>
        <dl className="mt-4 space-y-2 text-sm">
          <div className="flex justify-between"><dt className="text-text-muted">Items</dt><dd>{cart.itemCount}</dd></div>
          <div className="flex justify-between"><dt className="text-text-muted">Subtotal</dt><dd className="font-display text-xl">{formatPaise(cart.subtotalPaise)}</dd></div>
        </dl>
        <Link href="/cart" className="mt-4 block text-sm text-text-muted underline-offset-4 hover:underline">Edit bag</Link>
      </aside>
    </div>
  );
}
