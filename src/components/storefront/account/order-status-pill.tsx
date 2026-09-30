import type { OrderStatus } from "@prisma/client";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { cn } from "@/lib/utils";

const TONE: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "bg-amber-500/15 text-amber-300",
  PAID: "bg-surface-raised text-text",
  PROCESSING: "bg-surface-raised text-text",
  SHIPPED: "bg-brand text-brand-ink",
  DELIVERED: "bg-brand text-brand-ink",
  CANCELLED: "border border-border text-text-muted",
  EXPIRED: "border border-border text-text-muted",
  REFUNDED: "border border-border text-text-muted",
};

export function OrderStatusPill({ status }: { status: OrderStatus }) {
  return (
    <span
      data-testid="order-status"
      className={cn("inline-flex rounded-full px-2.5 py-0.5 text-xs font-medium uppercase tracking-wide", TONE[status])}
    >
      {ORDER_STATUS_LABEL[status]}
    </span>
  );
}
