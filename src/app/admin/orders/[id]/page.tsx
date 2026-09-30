import Image from "next/image";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MessageCircle, Phone } from "lucide-react";
import { CopyButton } from "@/components/admin/copy-button";
import { AdminNoteForm } from "@/components/admin/orders/admin-note-form";
import { OrderActions, ResolveAttentionButton } from "@/components/admin/orders/order-actions";
import { OrderStatusBadge } from "@/components/admin/orders/order-status-badge";
import { OrderTimeline } from "@/components/admin/orders/order-timeline";
import { TrackingForm } from "@/components/admin/orders/tracking-form";
import { PriceBreakup } from "@/components/storefront/price-breakup";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/config/brand";
import { addressLines, addressText, formatPhone } from "@/lib/address-format";
import { orderWhatsappText, telLink, whatsappLink } from "@/lib/contact-links";
import { formatDateTimeIst } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { isPaidStatus } from "@/lib/order-status";
import { NotFoundError } from "@/server/errors";
import { getAdminOrder } from "@/server/services/admin-orders";
import { orderDiscountLabel } from "@/server/services/order-records";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "Order" };
export const dynamic = "force-dynamic";

const CARD = "rounded-md border border-border bg-surface p-4";

function providerLabel(p: string): string {
  return p === "razorpay" ? "Razorpay" : p === "mock" ? "Mock (test)" : p;
}

export default async function AdminOrderPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const order = await getAdminOrder(id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const attention = order.needsAttention ? order.events.find((e) => e.type === "ATTENTION") : undefined;
  const waText = orderWhatsappText({ number: order.number, name: order.ship.name, brand: BRAND.name });

  return (
    <div className="space-y-5 pb-24 lg:pb-0" data-testid="admin-order">
      <Link href="/admin/orders" className="inline-flex min-h-11 items-center text-sm text-text-muted hover:text-text">← Orders</Link>

      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="break-all text-4xl md:text-5xl">{order.number}</h1>
          <OrderStatusBadge status={order.status} />
        </div>
        <p className="text-sm text-text-muted">
          Placed {formatDateTimeIst(order.createdAt)} · {order.itemCount} {order.itemCount === 1 ? "item" : "items"} · {formatPaise(order.totalPaise)}
        </p>
      </div>

      {order.needsAttention && (
        <div role="alert" className="flex flex-wrap items-center gap-3 rounded-md border border-amber-500/40 bg-amber-500/10 p-4 text-sm text-amber-200" data-testid="attention-banner">
          <p className="min-w-0 flex-1 break-words">
            <span className="font-medium">Needs attention. </span>
            {attention?.message ?? "Check this order."}
          </p>
          <ResolveAttentionButton orderId={order.id} />
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2">
        <OrderActions
          order={{ id: order.id, number: order.number, status: order.status, totalPaise: order.totalPaise, providerPaymentId: order.providerPaymentId, paymentProvider: order.paymentProvider, refundVia: order.refundVia }}
        />
        <div className="flex flex-wrap items-center gap-2" data-testid="print-actions">
          <Button variant="secondary" className="h-11" render={<a href={`/admin/orders/print?doc=label&ids=${order.id}`} target="_blank" rel="noopener" />} nativeButton={false} data-testid="print-label">
            Label
          </Button>
          <Button variant="secondary" className="h-11" render={<a href={`/admin/orders/print?doc=slip&ids=${order.id}`} target="_blank" rel="noopener" />} nativeButton={false} data-testid="print-slip">
            Packing slip
          </Button>
          {(isPaidStatus(order.status) || order.status === "REFUNDED") && (
            <Button variant="secondary" className="h-11" render={<a href={`/admin/orders/print?doc=invoice&ids=${order.id}`} target="_blank" rel="noopener" />} nativeButton={false} data-testid="print-invoice">
              Invoice
            </Button>
          )}
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-start">
        {/* Customer and ship-to come first on phones: they are what the owner needs while packing. */}
        <aside className="order-first space-y-5 lg:order-none lg:col-start-2 lg:row-start-1">
          {order.customerNote && (
            <div className="rounded-md border border-brand bg-brand/10 p-4 text-sm" data-testid="customer-note">
              <p className="font-medium">Customer note</p>
              <p className="mt-1 whitespace-pre-line break-words">{order.customerNote}</p>
            </div>
          )}

          <section className={CARD} aria-labelledby="customer-heading" data-testid="customer-card">
            <h2 id="customer-heading" className="text-2xl">Customer</h2>
            <p className="mt-2 font-medium">{order.customer.name ?? order.ship.name}</p>
            <a href={`mailto:${order.email}`} className="inline-flex min-h-11 items-center break-all text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">
              {order.email}
            </a>
            <p className="text-sm text-text-muted">{order.customer.paidOrderCount} paid {order.customer.paidOrderCount === 1 ? "order" : "orders"}</p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" className="h-11" render={<a href={telLink(order.ship.phone)} />} nativeButton={false} data-testid="call-link">
                <Phone className="size-4" /> {formatPhone(order.ship.phone)}
              </Button>
              <Button
                variant="secondary"
                className="h-11"
                render={<a href={whatsappLink(order.ship.phone, waText)} target="_blank" rel="noopener noreferrer" />}
                nativeButton={false}
                data-testid="whatsapp-link"
              >
                <MessageCircle className="size-4" /> WhatsApp
              </Button>
            </div>
          </section>

          <section className={CARD} aria-labelledby="ship-heading" data-testid="ship-card">
            <div className="flex items-start justify-between gap-2">
              <h2 id="ship-heading" className="text-2xl">Ship to</h2>
              <CopyButton text={addressText(order.ship.name, order.ship.phone, order.ship)} label="Copy shipping address" />
            </div>
            <address className="mt-2 text-sm not-italic">
              <p className="font-medium">{order.ship.name}</p>
              {addressLines(order.ship).map((l) => <p key={l} className="break-words">{l}</p>)}
              <p className="text-text-muted">Phone: {formatPhone(order.ship.phone)}</p>
            </address>
          </section>
        </aside>

        <div className="min-w-0 space-y-5 lg:col-start-1 lg:row-start-1">
          <section className={CARD} aria-labelledby="items-heading">
            <h2 id="items-heading" className="text-2xl">Items</h2>
            <ul className="mt-2 divide-y divide-border" aria-label="Items">
              {order.items.map((i) => (
                <li key={i.id} className="flex gap-3 py-3" data-testid="order-item">
                  <div className="relative size-12 shrink-0 overflow-hidden rounded-sm bg-surface-raised">
                    {i.imageUrl && <Image src={i.imageUrl} alt="" fill sizes="48px" className="object-cover" />}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium">{i.productName}</p>
                    <p className="text-xs text-text-muted">{i.colorName} / {i.size}</p>
                    <p className="break-all font-mono text-xs text-text-muted">{i.sku}</p>
                  </div>
                  <div className="shrink-0 text-right text-sm">
                    <p className="font-medium">× {i.quantity}</p>
                    <p className="text-text-muted">{formatPaise(i.lineTotalPaise)}</p>
                  </div>
                </li>
              ))}
            </ul>
            <PriceBreakup
              className="mt-2 border-t border-border pt-3"
              subtotalPaise={order.subtotalPaise}
              discountPaise={order.discountPaise}
              discountLabel={orderDiscountLabel(order)}
              shippingPaise={order.shippingPaise}
              totalPaise={order.totalPaise}
            />
          </section>

          <TrackingForm orderId={order.id} status={order.status} carrier={order.carrier} trackingNumber={order.trackingNumber} trackingUrl={order.trackingUrl} />

          <section className={CARD} aria-labelledby="payment-heading" data-testid="payment-card">
            <h2 id="payment-heading" className="text-2xl">Payment</h2>
            <dl className="mt-2 grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 gap-y-1 text-sm">
              <dt className="text-text-muted">Provider</dt>
              <dd>{providerLabel(order.paymentProvider)}</dd>
              <dt className="text-text-muted">Order ID</dt>
              <dd className="break-all font-mono">{order.providerOrderId ?? "—"}</dd>
              <dt className="text-text-muted">Payment ID</dt>
              <dd className="break-all font-mono">{order.providerPaymentId ?? "—"}</dd>
              <dt className="text-text-muted">Paid</dt>
              <dd>{order.paidAt ? formatDateTimeIst(order.paidAt) : "Not paid"}</dd>
              {order.refundedAt && (
                <>
                  <dt className="text-text-muted">Refunded</dt>
                  <dd>{formatDateTimeIst(order.refundedAt)}</dd>
                </>
              )}
            </dl>
          </section>

          <AdminNoteForm orderId={order.id} note={order.adminNote} />
          <OrderTimeline events={order.events} />
        </div>
      </div>
    </div>
  );
}
