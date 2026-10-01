import "lenis/dist/lenis.css";
import { LenisProvider, ReducedMotionConfig } from "@/components/motion";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { CartPanel } from "@/components/storefront/cart-panel";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import { auth } from "@/server/auth";
import { getCurrentCart, getCurrentCartPreview } from "@/server/cart-ref";
import { getAnnouncement } from "@/server/services/banners";

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const [session, cart, announcement] = await Promise.all([auth(), getCurrentCart(), getAnnouncement()]);
  const preview = cart.itemCount > 0 ? await getCurrentCartPreview() : null;
  return (
    <ReducedMotionConfig>
      <LenisProvider>
        {announcement && <AnnouncementBar announcement={announcement} />}
        <Header cartCount={cart.itemCount} isLoggedIn={Boolean(session?.user?.id)} />
        <main className="min-h-[70dvh]">{children}</main>
        <Footer />
        <CartDrawer itemCount={cart.itemCount}>
          <CartPanel cart={cart} variant="drawer" preview={preview} />
        </CartDrawer>
      </LenisProvider>
    </ReducedMotionConfig>
  );
}
