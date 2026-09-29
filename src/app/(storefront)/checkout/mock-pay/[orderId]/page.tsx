import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { mockPayAction } from "@/app/(storefront)/checkout/actions";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import { auth } from "@/server/auth";
import { NotFoundError } from "@/server/errors";
import { isMockPayments } from "@/server/payments";
import { getOwnedOrderRef } from "@/server/services/checkout";

export const metadata: Metadata = { title: "Test payment", robots: { index: false } };

export default async function MockPayPage({ params }: { params: Promise<{ orderId: string }> }) {
  if (!isMockPayments()) notFound();
  const { orderId } = await params;
  const session = await auth();
  if (!session?.user?.id) redirect(`/login?next=${encodeURIComponent(`/checkout/mock-pay/${orderId}`)}`);
  const order = await getOwnedOrderRef(session.user.id, orderId).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  if (order.status !== "PENDING_PAYMENT") redirect(`/orders/${encodeURIComponent(order.number)}/success`);
  return (
    <div className="container-x flex min-h-[60dvh] items-center justify-center py-10">
      <div className="w-full max-w-sm space-y-6 rounded-md border border-dashed border-border bg-surface p-6 text-center" data-testid="mock-pay">
        <p className="text-xs uppercase tracking-widest text-text-muted">Test payment · no money moves</p>
        <p className="font-display text-4xl">{formatPaise(order.totalPaise)}</p>
        <p className="text-sm text-text-muted">Order {order.number}</p>
        <form action={mockPayAction.bind(null, order.id, "succeed")}>
          <Button type="submit" className="h-12 w-full" data-testid="mock-pay-succeed">Pay successfully</Button>
        </form>
        <form action={mockPayAction.bind(null, order.id, "fail")}>
          <Button type="submit" variant="secondary" className="h-12 w-full" data-testid="mock-pay-fail">Fail the payment</Button>
        </form>
      </div>
    </div>
  );
}
