import type { Metadata } from "next";
import { CartPanel } from "@/components/storefront/cart-panel";
import { getCurrentCart } from "@/server/cart-ref";

export const metadata: Metadata = { title: "Your bag" };

export default async function CartPage() {
  const cart = await getCurrentCart();
  return (
    <div className="container-x py-10">
      <h1 className="mb-8 text-5xl md:text-7xl">Your bag</h1>
      <CartPanel cart={cart} variant="page" />
    </div>
  );
}
