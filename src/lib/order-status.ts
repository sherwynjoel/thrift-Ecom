import type { OrderStatus } from "@prisma/client";

export const PAID_STATUSES = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"] as const satisfies readonly OrderStatus[];
export const STOCK_HOLDING_STATUSES = ["PENDING_PAYMENT", "PAID", "PROCESSING"] as const satisfies readonly OrderStatus[];
/** Orders that still need to leave the building: paid and awaiting dispatch (the admin "To ship" tab). */
export const TO_SHIP_STATUSES = ["PAID", "PROCESSING"] as const satisfies readonly OrderStatus[];

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  PENDING_PAYMENT: "Awaiting payment",
  PAID: "Paid",
  PROCESSING: "Processing",
  SHIPPED: "Shipped",
  DELIVERED: "Delivered",
  CANCELLED: "Cancelled",
  EXPIRED: "Expired",
  REFUNDED: "Refunded",
};

export const ORDER_EVENT_TYPES = [
  "CREATED", "PAID", "PAYMENT_FAILED", "STATUS_CHANGED", "NOTE", "EMAIL_SENT", "EMAIL_FAILED",
  "EXPIRED", "TRACKING_UPDATED", "REFUNDED", "ATTENTION",
] as const;
export type OrderEventType = (typeof ORDER_EVENT_TYPES)[number];

export type FulfilmentStatus = "PROCESSING" | "SHIPPED" | "DELIVERED";
const CHAIN: OrderStatus[] = ["PAID", "PROCESSING", "SHIPPED", "DELIVERED"];

export function isPaidStatus(s: OrderStatus): boolean {
  return (PAID_STATUSES as readonly OrderStatus[]).includes(s);
}

export function canCancel(s: OrderStatus): boolean {
  return (STOCK_HOLDING_STATUSES as readonly OrderStatus[]).includes(s);
}

export function fulfilmentRank(s: OrderStatus): number {
  return CHAIN.indexOf(s);
}

export function nextFulfilmentStatus(s: OrderStatus): FulfilmentStatus | null {
  const i = CHAIN.indexOf(s);
  return i >= 0 && i < CHAIN.length - 1 ? (CHAIN[i + 1] as FulfilmentStatus) : null;
}
