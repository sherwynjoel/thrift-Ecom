import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CircleCheck, Loader2 } from "lucide-react";
import { AutoRefresh } from "@/components/storefront/checkout/auto-refresh";
import { RetryPaymentButton } from "@/components/storefront/checkout/retry-payment-button";
import { PriceBreakup } from "@/components/storefront/price-breakup";
import { Button } from "@/components/ui/button";
import { addressLines, formatPhone } from "@/lib/address-format";
import { formatTimeIst } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { isPaidStatus } from "@/lib/order-status";
import { auth } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { orderDiscountLabel, type OrderView } from "@/server/services/order-records";
import { getOrderForUser } from "@/server/services/orders";

export const metadata: Metadata = { title: "Your order", robots: { index: false } };
export const dynamic = "force-dynamic";

type PaymentFlag = "failed" | "dismissed" | "verifying" | undefined;

function paymentFlag(v: string | string[] | undefined): PaymentFlag {
  return v === "failed" || v === "dismissed" || v === "verifying" ? v : undefined;
}

const actionBtn = "h-11 w-full px-6 sm:w-auto";

function BackToBag() {
  return (
    <Button render={<Link href="/cart" />} nativeButton={false} variant="secondary" className={actionBtn}>Back to bag</Button>
  );
}

function Confirmed({ order }: { order: OrderView }) {
  return (
    <section data-testid="order-success" className="space-y-8">
      <div className="space-y-3 text-center">
        <CircleCheck className="mx-auto size-12 text-brand" aria-hidden />
        <h1 className="text-4xl md:text-6xl">Order confirmed</h1>
        <p data-testid="order-number" className="font-display text-3xl">{order.number}</p>
        <p className="break-words text-text-muted">We emailed a confirmation to {order.email}.</p>
      </div>

      <ul className="divide-y divide-border border-y border-border" aria-label="Items">
        {order.items.map((i) => (
          <li key={i.id} className="flex gap-3 py-3">
            <div className="relative aspect-[4/5] w-14 shrink-0 overflow-hidden rounded-sm bg-surface">
              {i.imageUrl && <Image src={i.imageUrl} alt={i.productName} fill sizes="56px" className="object-cover" />}
            </div>
            <div className="flex min-w-0 flex-1 flex-col gap-0.5">
              <p className="line-clamp-2 text-sm font-medium">{i.productName}</p>
              <p className="text-xs text-text-muted">{i.colorName} / {i.size} × {i.quantity}</p>
            </div>
            <p className="shrink-0 font-display text-lg">{formatPaise(i.lineTotalPaise)}</p>
          </li>
        ))}
      </ul>

      <PriceBreakup
        subtotalPaise={order.subtotalPaise}
        discountPaise={order.discountPaise}
        discountLabel={orderDiscountLabel(order)}
        shippingPaise={order.shippingPaise}
        totalPaise={order.totalPaise}
      />

      <div className="rounded-md border border-border bg-surface p-4 text-sm">
        <p className="font-medium">Shipping to</p>
        <p className="mt-1">{order.ship.name}</p>
        {addressLines(order.ship).map((l) => <p key={l} className="break-words text-text-muted">{l}</p>)}
        <p className="text-text-muted">{formatPhone(order.ship.phone)}</p>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <Button render={<Link href={`/account/orders/${encodeURIComponent(order.number)}`} />} nativeButton={false} className={actionBtn}>View order</Button>
        <Button render={<Link href="/collections/new-drops" />} nativeButton={false} variant="secondary" className={actionBtn}>Keep shopping</Button>
      </div>
    </section>
  );
}

function Notice({ testId, title, children }: { testId: string; title: string; children: React.ReactNode }) {
  return (
    <section data-testid={testId} className="space-y-4 text-center">
      <h1 className="text-4xl md:text-5xl">{title}</h1>
      {children}
    </section>
  );
}

export default async function OrderStatusPage({ params, searchParams }: {
  params: Promise<{ number: string }>;
  searchParams: Promise<{ payment?: string | string[] }>;
}) {
  const [{ number }, sp] = await Promise.all([params, searchParams]);
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?next=${encodeURIComponent(`/orders/${number}/success`)}`);
  const order = await getOrderForUser(session.user.id, number).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const payment = paymentFlag(sp.payment);

  let body: React.ReactNode;
  if (isPaidStatus(order.status)) {
    body = <Confirmed order={order} />;
  } else if (order.status === "PENDING_PAYMENT" && order.expiresAt <= new Date()) {
    body = (
      <Notice testId="order-expired" title="This order was not paid in time">
        <p className="text-text-muted">The items went back on the shelf. If money was debited, it will be confirmed automatically or refunded.</p>
        <div className="flex justify-center"><BackToBag /></div>
      </Notice>
    );
  } else if (order.status === "PENDING_PAYMENT" && (payment === "failed" || payment === "dismissed")) {
    body = (
      <Notice testId="payment-incomplete" title="Payment not completed">
        <p className="text-text-muted">
          Order <span className="font-medium text-text">{order.number}</span> for {formatPaise(order.totalPaise)}. Your items are held until {formatTimeIst(order.expiresAt)}.
        </p>
        <div className="flex flex-col items-center justify-center gap-3 sm:flex-row">
          <RetryPaymentButton number={order.number} />
          <BackToBag />
        </div>
      </Notice>
    );
  } else if (order.status === "PENDING_PAYMENT") {
    body = (
      <Notice testId="payment-confirming" title="Confirming your payment…">
        <Loader2 className="mx-auto size-8 animate-spin text-text-muted" aria-hidden />
        <p className="text-text-muted" role="status">This takes a few seconds. You can safely leave; we will email you when it is confirmed.</p>
        <AutoRefresh />
      </Notice>
    );
  } else if (order.status === "EXPIRED") {
    body = (
      <Notice testId="order-expired" title="This order was not paid in time">
        <p className="text-text-muted">
          Unpaid orders are released after 30 minutes, or when you start a new checkout. If money was debited, it will be confirmed automatically or refunded.
        </p>
        <div className="flex justify-center"><BackToBag /></div>
      </Notice>
    );
  } else if (order.status === "CANCELLED") {
    body = (
      <Notice testId="order-cancelled" title="This order was cancelled">
        <div className="flex justify-center"><BackToBag /></div>
      </Notice>
    );
  } else {
    body = (
      <Notice testId="order-refunded" title="This order was refunded.">
        <p className="text-text-muted">Order {order.number}.</p>
      </Notice>
    );
  }

  return <div className="container-x max-w-2xl py-10">{body}</div>;
}
