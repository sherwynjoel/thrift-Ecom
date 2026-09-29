import { db } from "@/server/db";
import { getEmail, type EmailMessage } from "@/server/adapters/email";
import {
  adminNewOrderEmail, orderCancelledEmail, orderConfirmationEmail, orderDeliveredEmail, orderRefundedEmail, orderShippedEmail, type RenderedEmail,
} from "@/server/emails/templates";
import { addOrderEvent, getOrderById } from "@/server/services/order-records";
import { getSettings } from "@/server/services/settings";

export type OrderNotice = "paid" | "shipped" | "delivered" | "cancelled" | "refunded";
export type AdminSendResult = "sent" | "failed" | "no-recipient";

const CUSTOMER = {
  paid: { render: orderConfirmationEmail, label: "Order confirmation" },
  shipped: { render: orderShippedEmail, label: "Shipped" },
  delivered: { render: orderDeliveredEmail, label: "Delivered" },
  cancelled: { render: orderCancelledEmail, label: "Cancellation" },
  refunded: { render: orderRefundedEmail, label: "Refund" },
} as const;

export async function sendEmailSafely(msg: EmailMessage): Promise<boolean> {
  try {
    await getEmail().send(msg);
    return true;
  } catch (err) {
    console.error("[email] send failed", msg.to, msg.subject, err);
    return false;
  }
}

async function sendAndRecord(orderId: string, to: string, rendered: RenderedEmail, label: string): Promise<void> {
  const ok = await sendEmailSafely({ to, ...rendered });
  await addOrderEvent(db, orderId, ok ? "EMAIL_SENT" : "EMAIL_FAILED", `${label} email ${ok ? "sent" : "failed"} → ${to}`);
}

export async function notifyOrder(orderId: string, notice: OrderNotice): Promise<void> {
  try {
    const order = await getOrderById(orderId);
    const t = CUSTOMER[notice];
    await sendAndRecord(orderId, order.email, t.render(order), t.label);
    if (notice === "paid") {
      const settings = await getSettings();
      if (settings.adminNotifyEmail) await sendAndRecord(orderId, settings.adminNotifyEmail, adminNewOrderEmail(order), "Admin new-order");
    }
  } catch (err) {
    console.error("[notify] failed", orderId, notice, err);
  }
}

export async function sendToAdmin(rendered: RenderedEmail): Promise<AdminSendResult> {
  const settings = await getSettings();
  if (!settings.adminNotifyEmail) return "no-recipient";
  return (await sendEmailSafely({ to: settings.adminNotifyEmail, ...rendered })) ? "sent" : "failed";
}
