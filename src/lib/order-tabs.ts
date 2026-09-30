import type { OrderStatus } from "@prisma/client";
import { TO_SHIP_STATUSES } from "@/lib/order-status";

export type OrderTab = "to-ship" | "pending" | "shipped" | "delivered" | "closed" | "all";

export const ORDER_TABS: readonly { id: OrderTab; label: string; statuses: readonly OrderStatus[] | null }[] = [
  { id: "to-ship", label: "To ship", statuses: TO_SHIP_STATUSES },
  { id: "pending", label: "Awaiting payment", statuses: ["PENDING_PAYMENT"] },
  { id: "shipped", label: "Shipped", statuses: ["SHIPPED"] },
  { id: "delivered", label: "Delivered", statuses: ["DELIVERED"] },
  { id: "closed", label: "Cancelled / refunded", statuses: ["CANCELLED", "EXPIRED", "REFUNDED"] },
  { id: "all", label: "All", statuses: null },
];

export function parseOrderTab(s: string | undefined | null): OrderTab {
  return ORDER_TABS.some((t) => t.id === s) ? (s as OrderTab) : "to-ship";
}
