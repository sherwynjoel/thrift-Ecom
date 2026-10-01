import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { TrackEvent } from "@/components/analytics/track-event";
import { CheckoutForm } from "@/components/storefront/checkout/checkout-form";
import { Button } from "@/components/ui/button";
import { NO_INDEX } from "@/lib/seo";
import { auth } from "@/server/auth";
import { paymentProviderName } from "@/server/payments";
import { checkoutFormKey, getCheckoutView } from "@/server/services/checkout";

export const metadata: Metadata = { title: "Checkout", robots: NO_INDEX };
export const dynamic = "force-dynamic";

export default async function CheckoutPage() {
  const session = await auth();
  if (!session?.user?.id) redirect("/login?next=%2Fcheckout");
  const view = await getCheckoutView(session.user.id);
  if (view.lines.length === 0) {
    return (
      <div className="container-x py-16 text-center" data-testid="checkout-empty">
        <h1 className="text-5xl">Your bag is empty</h1>
        {view.stockIssues.length > 0 && <p className="mt-3 text-text-muted" role="status">Items in your bag just sold out.</p>}
        <Button render={<Link href="/collections/new-drops" />} nativeButton={false} className="mt-6 h-11 px-6">Shop new drops</Button>
      </div>
    );
  }
  return (
    <>
      {/* Remount the form when the server-side bag or its price changes (e.g. a failed Pay + router.refresh()). */}
      <CheckoutForm key={checkoutFormKey(view)} view={view} provider={paymentProviderName()} />
      <TrackEvent
        event={{
          name: "begin_checkout",
          valuePaise: view.price.totalPaise,
          items: view.lines.map((l) => ({ id: l.productId, name: l.productName, pricePaise: l.unitPricePaise, quantity: l.quantity, variant: `${l.colorName} / ${l.size}` })),
        }}
      />
    </>
  );
}
