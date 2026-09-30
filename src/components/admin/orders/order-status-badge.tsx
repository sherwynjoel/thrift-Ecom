import type { OrderStatus } from "@prisma/client";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { cn } from "@/lib/utils";

const TONE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-amber-500/15 text-amber-300",
  PAID: "bg-brand text-brand-ink",
  PROCESSING: "bg-surface-raised text-text",
  SHIPPED: "border border-brand text-brand",
  DELIVERED: "border border-brand text-brand",
  CANCELLED: "bg-surface text-text-muted border border-border",
  EXPIRED: "bg-surface text-text-muted border border-border",
  REFUNDED: "bg-surface text-text-muted border border-border",
};

export function OrderStatusBadge({ status }: { status: OrderStatus }) {
  return (
    <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium uppercase tracking-wide", TONE[status])} data-testid="order-status">
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
