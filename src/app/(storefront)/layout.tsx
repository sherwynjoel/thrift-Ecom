import "lenis/dist/lenis.css";
import { cookies } from "next/headers";
import { LenisProvider, ReducedMotionConfig } from "@/components/motion";
import { CartDrawer } from "@/components/storefront/cart-drawer";
import { CartPanel } from "@/components/storefront/cart-panel";
import { AnnouncementBar } from "@/components/storefront/announcement-bar";
import { Footer } from "@/components/storefront/footer";
import { Header } from "@/components/storefront/header";
import { WishlistProvider } from "@/components/storefront/wishlist-context";
import { ANN_DISMISSED_COOKIE, announcementHash } from "@/lib/announcement-cookie";
import { auth } from "@/server/auth";
import { getCurrentCart, getCurrentCartPreview } from "@/server/cart-ref";
import { getAnnouncement } from "@/server/services/banners";
import { listWishlistProductIds } from "@/server/services/wishlist";

export default async function StorefrontLayout({ children }: { children: React.ReactNode }) {
  const session = await auth();
  const userId = session?.user?.id ?? null;
  const [cart, announcement, wishlistIds, dismissedHash] = await Promise.all([
    getCurrentCart(),
    getAnnouncement(),
    userId ? listWishlistProductIds(userId) : Promise.resolve([] as string[]),
    cookies().then((store) => store.get(ANN_DISMISSED_COOKIE)?.value ?? null),
  ]);
  const showAnnouncement = announcement && dismissedHash !== announcementHash(announcement.text);
  const preview = cart.itemCount > 0 ? await getCurrentCartPreview() : null;
  return (
    <ReducedMotionConfig>
      <LenisProvider>
        <WishlistProvider key={userId ?? "guest"} loggedIn={Boolean(userId)} initialIds={wishlistIds}>
          {showAnnouncement && <AnnouncementBar announcement={announcement} />}
          <Header cartCount={cart.itemCount} isLoggedIn={Boolean(userId)} />
          <main className="min-h-[70dvh]">{children}</main>
          <Footer />
          <CartDrawer itemCount={cart.itemCount}>
            <CartPanel cart={cart} variant="drawer" preview={preview} />
          </CartDrawer>
        </WishlistProvider>
      </LenisProvider>
    </ReducedMotionConfig>
  );
}
