import type { OrderStatus, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { NotFoundError } from "@/server/errors";
import type { OrderEventType } from "@/lib/order-status";

export type Tx = Prisma.TransactionClient;

export interface ShipAddress { name: string; phone: string; line1: string; line2: string | null; landmark: string | null; city: string; state: string; pincode: string }
export interface OrderItemView {
  id: string; productId: string | null; productName: string; productSlug: string; size: string; colorName: string;
  imageUrl: string | null; sku: string; unitPricePaise: number; quantity: number; lineTotalPaise: number;
}
export interface OrderView {
  id: string; number: string; status: OrderStatus; userId: string; email: string; createdAt: Date; expiresAt: Date;
  paidAt: Date | null; processingAt: Date | null; shippedAt: Date | null; deliveredAt: Date | null; cancelledAt: Date | null; refundedAt: Date | null;
  subtotalPaise: number; discountPaise: number; shippingPaise: number; totalPaise: number;
  couponCode: string | null; offerLabel: string | null;
  paymentProvider: string; providerOrderId: string | null; providerPaymentId: string | null;
  carrier: string | null; trackingNumber: string | null; trackingUrl: string | null; customerNote: string | null;
  ship: ShipAddress; items: OrderItemView[]; itemCount: number;
}
export interface OrderSummary {
  id: string; number: string; status: OrderStatus; createdAt: Date; paidAt: Date | null; totalPaise: number;
  itemCount: number; firstItemName: string; firstImageUrl: string | null;
}

export const orderWithItems = { items: { orderBy: { id: "asc" as const } } } satisfies Prisma.OrderInclude;
export type OrderRow = Prisma.OrderGetPayload<{ include: typeof orderWithItems }>;

export function toOrderView(o: OrderRow): OrderView {
  return {
    id: o.id, number: o.number, status: o.status, userId: o.userId, email: o.email, createdAt: o.createdAt, expiresAt: o.expiresAt,
    paidAt: o.paidAt, processingAt: o.processingAt, shippedAt: o.shippedAt, deliveredAt: o.deliveredAt, cancelledAt: o.cancelledAt, refundedAt: o.refundedAt,
    subtotalPaise: o.subtotalPaise, discountPaise: o.discountPaise, shippingPaise: o.shippingPaise, totalPaise: o.totalPaise,
    couponCode: o.couponCode, offerLabel: o.offerLabel,
    paymentProvider: o.paymentProvider, providerOrderId: o.providerOrderId, providerPaymentId: o.providerPaymentId,
    carrier: o.carrier, trackingNumber: o.trackingNumber, trackingUrl: o.trackingUrl, customerNote: o.customerNote,
    ship: { name: o.shipName, phone: o.shipPhone, line1: o.shipLine1, line2: o.shipLine2, landmark: o.shipLandmark, city: o.shipCity, state: o.shipState, pincode: o.shipPincode },
    items: o.items.map((i) => ({
      id: i.id, productId: i.productId, productName: i.productName, productSlug: i.productSlug, size: i.size, colorName: i.colorName,
      imageUrl: i.imageUrl, sku: i.sku, unitPricePaise: i.unitPricePaise, quantity: i.quantity, lineTotalPaise: i.lineTotalPaise,
    })),
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
  };
}

export function toOrderSummary(o: OrderRow): OrderSummary {
  return {
    id: o.id, number: o.number, status: o.status, createdAt: o.createdAt, paidAt: o.paidAt, totalPaise: o.totalPaise,
    itemCount: o.items.reduce((s, i) => s + i.quantity, 0),
    firstItemName: o.items[0]?.productName ?? "",
    firstImageUrl: o.items.find((i) => i.imageUrl)?.imageUrl ?? null,
  };
}

export function orderDiscountLabel(o: { couponCode: string | null; offerLabel: string | null }): string | null {
  if (o.couponCode) return `Code ${o.couponCode}`;
  if (o.offerLabel) return `Offer: ${o.offerLabel}`;
  return null;
}

export async function addOrderEvent(tx: Tx, orderId: string, type: OrderEventType, message: string, actorId?: string | null): Promise<void> {
  await tx.orderEvent.create({ data: { orderId, type, message: message.slice(0, 1000), actorId: actorId ?? null } });
}

export async function getOrderById(id: string): Promise<OrderView> {
  const o = await db.order.findUnique({ where: { id }, include: orderWithItems });
  if (!o) throw new NotFoundError("Order");
  return toOrderView(o);
}
