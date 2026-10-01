import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { OrderStatusPill } from "@/components/storefront/account/order-status-pill";
import { OrderStepper } from "@/components/storefront/account/order-stepper";
import { AutoRefresh } from "@/components/storefront/checkout/auto-refresh";
import { RetryPaymentButton } from "@/components/storefront/checkout/retry-payment-button";
import { CustomPrintThumbs } from "@/components/storefront/custom-print-thumbs";
import { PriceBreakup } from "@/components/storefront/price-breakup";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { addressLines, formatPhone } from "@/lib/address-format";
import { customPrintLabel, isCustomItem, printSidesOf } from "@/lib/custom-pricing";
import { formatDateTimeIst, formatTimeIst } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { isPaidStatus, pendingPaymentMode } from "@/lib/order-status";
import { isHttpUrl } from "@/lib/url";
import { auth } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { orderDiscountLabel } from "@/server/services/order-records";
import { getOrderForUser, hasFailedPaymentAttempt } from "@/server/services/orders";

export const metadata: Metadata = { title: "Order" };
export const dynamic = "force-dynamic";

function paymentFailed(v: string | string[] | undefined): boolean {
  return (Array.isArray(v) ? v[0] : v) === "failed";
}

export default async function AccountOrderDetailPage({ params, searchParams }: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ payment?: string | string[] }>;
}) {
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?next=${encodeURIComponent(`/account/orders/${number}`)}`);
  const order = await getOrderForUser(session.user.id, number).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });

  const unpaid = order.status === "PENDING_PAYMENT" && order.expiresAt > new Date();
  const mode = unpaid ? pendingPaymentMode(sp.payment, await hasFailedPaymentAttempt(order.id)) : null;
  const canDownloadInvoice = isPaidStatus(order.status) || order.status === "REFUNDED";

  return (
    <div className="container-x space-y-8 py-10">
      <Link href="/account/orders" className="inline-flex min-h-11 items-center text-sm text-text-muted hover:text-text">← Orders</Link>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-4xl md:text-6xl">{order.number}</h1>
          <OrderStatusPill status={order.status} />
        </div>
        <p className="text-text-muted">Placed {formatDateTimeIst(order.createdAt)}</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-8">
          {mode === "retry" && (
            <div role="status" className="space-y-3 rounded-md border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-200">
              {paymentFailed(sp.payment) && <p>The last attempt failed. No money was taken.</p>}
              <p>Payment not completed. Your items are held until {formatTimeIst(order.expiresAt)}.</p>
              <RetryPaymentButton number={order.number} />
            </div>
          )}
          {mode === "confirming" && (
            <div className="space-y-2 rounded-md border border-border bg-surface p-4 text-sm" data-testid="payment-confirming">
              <p className="font-medium">Confirming your payment…</p>
              <AutoRefresh
                fallback={
                  <p className="text-text-muted">
                    Still waiting? If money left your account it will be confirmed automatically. Didn&apos;t pay? Your items are held until {formatTimeIst(order.expiresAt)}; check out again from your bag.
                    Payment taken but not confirmed? Contact {BRAND.supportEmail} with your order number.
                  </p>
                }
              >
                <p className="text-text-muted" role="status">This takes a few seconds. We will email you when it is confirmed.</p>
              </AutoRefresh>
            </div>
          )}

          <OrderStepper order={order} />

          {order.trackingNumber && (
            <div className="space-y-2 rounded-md border border-border bg-surface p-4 text-sm" data-testid="tracking-card">
              <p className="font-medium">Tracking</p>
              {order.carrier && <p className="text-text-muted">{order.carrier}</p>}
              <p className="select-all font-mono">{order.trackingNumber}</p>
              {order.trackingUrl && isHttpUrl(order.trackingUrl) && (
                <Button render={<a href={order.trackingUrl} target="_blank" rel="noopener noreferrer" />} nativeButton={false} className="h-11 px-5">
                  Track parcel
                </Button>
              )}
            </div>
          )}

          <ul className="divide-y divide-border border-y border-border" aria-label="Items">
            {order.items.map((i) => (
              <li key={i.id} className="flex gap-3 py-3">
                <div className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-sm bg-surface">
                  {i.imageUrl && <Image src={i.imageUrl} alt={i.productName} fill sizes="56px" className="object-cover" />}
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <Link href={`/products/${i.productSlug}`} className="line-clamp-2 text-sm font-medium hover:underline">{i.productName}</Link>
                    {isCustomItem(i) && <Badge variant="outline">Custom</Badge>}
                  </div>
                  <p className="text-xs text-text-muted">{i.colorName} / {i.size} × {i.quantity}</p>
                  {isCustomItem(i) && (
                    <>
                      <p className="text-xs font-medium text-brand">{customPrintLabel(printSidesOf(i))}</p>
                      {/* The line image is already one of the previews (front, or back for back-only designs); don't repeat it. */}
                      <CustomPrintThumbs front={i.designFrontPreviewUrl} back={i.designBackPreviewUrl} exclude={i.imageUrl} className="mt-1" />
                    </>
                  )}
                </div>
                <p className="shrink-0 font-display text-lg">{formatPaise(i.lineTotalPaise)}</p>
              </li>
            ))}
          </ul>
        </div>

        <div className="space-y-6">
          <PriceBreakup
            subtotalPaise={order.subtotalPaise}
            discountPaise={order.discountPaise}
            discountLabel={orderDiscountLabel(order)}
            shippingPaise={order.shippingPaise}
            totalPaise={order.totalPaise}
          />

          <div className="rounded-md border border-border bg-surface p-4 text-sm">
            <p className="font-medium">Delivering to</p>
            <p className="mt-1">{order.ship.name}</p>
            {addressLines(order.ship).map((l) => <p key={l} className="break-words text-text-muted">{l}</p>)}
            <p className="text-text-muted">{formatPhone(order.ship.phone)}</p>
            {order.customerNote && <p className="mt-2 break-words text-text-muted">Note: {order.customerNote}</p>}
          </div>

          {canDownloadInvoice && (
            <Button
              render={<a href={`/invoice/${encodeURIComponent(order.number)}`} target="_blank" rel="noopener noreferrer" />}
              nativeButton={false}
              variant="secondary"
              className="h-11 w-full"
              data-testid="invoice-link"
            >
              Download invoice
            </Button>
          )}
        </div>
      </div>

      <p className="text-sm text-text-muted">Need help? Email {BRAND.supportEmail} with your order number.</p>
    </div>
  );
}
