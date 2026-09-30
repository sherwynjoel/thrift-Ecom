import Image from "next/image";
import Link from "next/link";
import { OrderStatusPill } from "@/components/storefront/account/order-status-pill";
import { formatDateIst } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import type { OrderSummary } from "@/server/services/order-records";

export function OrderCard({ order }: { order: OrderSummary }) {
  return (
    <Link
      href={`/account/orders/${encodeURIComponent(order.number)}`}
      data-testid="account-order-row"
      className="flex min-h-11 items-center gap-4 rounded-md border border-border bg-surface p-4 hover:border-text-muted"
    >
      <div className="relative size-14 shrink-0 overflow-hidden rounded-sm bg-surface-raised">
        {order.firstImageUrl && <Image src={order.firstImageUrl} alt="" fill sizes="56px" className="object-cover" />}
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{order.number}</p>
        <p className="truncate text-sm text-text-muted">{formatDateIst(order.createdAt)} · {order.itemCount} item{order.itemCount === 1 ? "" : "s"}</p>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1">
        <OrderStatusPill status={order.status} />
        <p className="font-display text-lg">{formatPaise(order.totalPaise)}</p>
      </div>
    </Link>
  );
}
