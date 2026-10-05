import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountNav } from "@/components/storefront/account/account-nav";
import { ProductGrid } from "@/components/storefront/product-grid";
import { NO_INDEX } from "@/lib/seo";
import { auth } from "@/server/auth";
import { listWishlist } from "@/server/services/wishlist";

export const metadata: Metadata = { title: "Wishlist", robots: NO_INDEX };

export default async function WishlistPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=%2Faccount%2Fwishlist");
  const items = await listWishlist(session.user.id);
  return (
    <div className="container-x space-y-6 py-10" data-testid="wishlist-page">
      <h1 className="text-5xl md:text-7xl">Wishlist</h1>
      <AccountNav />
      {items.length > 0 ? (
        <ProductGrid products={items} />
      ) : (
        <div className="rounded-md border border-dashed border-border bg-surface p-8" data-testid="wishlist-empty">
          <p className="font-display text-2xl">Nothing saved yet</p>
          <p className="mt-1 text-text-muted">Tap the heart on any tee to keep it here.</p>
          <Link href="/collections/new-drops" className="mt-4 inline-flex min-h-11 items-center underline-offset-4 hover:underline">Browse new drops</Link>
        </div>
      )}
    </div>
  );
}
