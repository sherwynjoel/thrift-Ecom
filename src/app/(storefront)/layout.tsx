import "lenis/dist/lenis.css";
import { LenisProvider, ReducedMotionConfig } from "@/components/motion";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { CartPanel } from "@/components/storefront/cart-panel";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import { auth } from "@/server/auth";
import { getCurrentCart } from "@/server/cart-ref";

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const [session, cart] = await Promise.all([auth(), getCurrentCart()]);
  return (
    <ReducedMotionConfig>
      <LenisProvider>
        <Header cartCount={cart.itemCount} isLoggedIn={Boolean(session?.user?.id)} />
        <main className="min-h-[70dvh]">{children}</main>
        <Footer />
        <CartDrawer itemCount={cart.itemCount}>
          <CartPanel cart={cart} variant="drawer" />
        </CartDrawer>
      </LenisProvider>
    </ReducedMotionConfig>
  );
}
