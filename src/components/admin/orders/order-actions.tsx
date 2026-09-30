"use client";

import type { OrderStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { advanceStatusAction, cancelOrderAction, clearAttentionAction, refundOrderAction } from "@/app/admin/orders/actions";
import { FieldError } from "@/components/admin/field-error";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { formatPaise } from "@/lib/money";
import { canCancel, isPaidStatus, nextFulfilmentStatus, type FulfilmentStatus } from "@/lib/order-status";
import type { AdminOrderDetail } from "@/server/services/admin-orders";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const NEXT_LABEL: Record<FulfilmentStatus, string> = { PROCESSING: "Mark processing", SHIPPED: "Mark shipped", DELIVERED: "Mark delivered" };
const DONE_TOAST: Record<FulfilmentStatus, string> = { PROCESSING: "Marked processing", SHIPPED: "Marked shipped; customer emailed", DELIVERED: "Marked delivered; customer emailed" };

type Props = { order: Pick<AdminOrderDetail, "id" | "number" | "status" | "totalPaise" | "providerPaymentId" | "paymentProvider"> };

function canRefund(status: OrderStatus, paymentId: string | null): boolean {
  return isPaidStatus(status) || (status === "CANCELLED" && Boolean(paymentId));
}

/** Moves focus to the tracking form, so "Mark shipped" never ships without a tracking number by accident. */
function focusTracking() {
  const input = document.getElementById("tracking-number");
  if (!input) return false;
  input.scrollIntoView({ behavior: "smooth", block: "center" });
  input.focus({ preventScroll: true });
  return true;
}

export function OrderActions({ order }: Props) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [cancelOpen, setCancelOpen] = useState(false);
  const [refundOpen, setRefundOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string[] | undefined>();
  const next = nextFulfilmentStatus(order.status);
  const viaRazorpay = order.paymentProvider === "razorpay" && Boolean(order.providerPaymentId);
  const viaMock = order.paymentProvider === "mock" && Boolean(order.providerPaymentId);

  const advance = (to: FulfilmentStatus) =>
    start(async () => {
      try {
        const r = await advanceStatusAction(order.id, to);
        if (!r.ok) {
          toast.error(r.message);
          return;
        }
        toast.success(DONE_TOAST[to]);
        router.refresh();
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });

  const onNext = () => {
    if (!next) return;
    if (next === "SHIPPED" && focusTracking()) {
      toast.message("Add the tracking number, then Save & mark shipped");
      return;
    }
    advance(next);
  };

  const cancel = () =>
    start(async () => {
      try {
        const r = await cancelOrderAction(order.id, reason);
        if (!r.ok) {
          setReasonError(r.fieldErrors?.reason);
          toast.error(r.message);
          if (!r.fieldErrors?.reason) setCancelOpen(false);
          return;
        }
        toast.success(`Order ${order.number} cancelled; stock restocked`);
        setCancelOpen(false);
        router.refresh();
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });

  const refund = () =>
    start(async () => {
      try {
        const r = await refundOrderAction(order.id);
        setRefundOpen(false);
        if (!r.ok) {
          toast.error(r.message);
          router.refresh();
          return;
        }
        toast.success(r.data.refundId ? `Refund ${r.data.refundId} created` : "Marked as refunded");
        router.refresh();
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });

  const showCancel = canCancel(order.status);
  const showRefund = canRefund(order.status, order.providerPaymentId);
  if (!next && !showCancel && !showRefund) return null;

  return (
    <div className="flex flex-wrap items-center gap-2" data-testid="order-actions">
      {next && (
        <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
          <Button type="button" className="h-12 w-full px-6 text-base sm:w-auto" onClick={onNext} disabled={pending} data-testid="next-action">
            {NEXT_LABEL[next]}
          </Button>
          {next === "SHIPPED" && (
            <Button type="button" variant="link" className="h-11 px-2" onClick={() => advance("SHIPPED")} disabled={pending} data-testid="ship-without-tracking">
              Ship without tracking
            </Button>
          )}
        </div>
      )}
      {showCancel && (
        <Button type="button" variant="destructive" className="h-11 px-4" onClick={() => { setReasonError(undefined); setCancelOpen(true); }} disabled={pending} data-testid="cancel-order">
          Cancel &amp; restock
        </Button>
      )}
      {showRefund && (
        <Button type="button" variant="destructive" className="h-11 px-4" onClick={() => setRefundOpen(true)} disabled={pending} data-testid="refund-order">
          Refund
        </Button>
      )}

      <Dialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <DialogContent className="bg-bg">
          <DialogTitle>Cancel order {order.number}?</DialogTitle>
          <DialogDescription>Stock goes back on sale. This does not refund money; use Refund for that.</DialogDescription>
          <div>
            <Label htmlFor="cancel-reason">Reason (optional, the customer does not see it)</Label>
            <textarea
              id="cancel-reason"
              rows={3}
              maxLength={200}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              aria-invalid={reasonError ? true : undefined}
              className="mt-1 w-full rounded-md border border-border bg-bg p-3 text-base md:text-sm"
            />
            <FieldError errors={reasonError} />
          </div>
          <DialogFooter>
            <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => setCancelOpen(false)}>Keep order</Button>
            <Button type="button" variant="destructive" className="h-11 px-4" onClick={cancel} disabled={pending} data-testid="confirm-cancel">
              {pending ? "Cancelling…" : "Cancel order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={refundOpen} onOpenChange={setRefundOpen}>
        <DialogContent className="bg-bg">
          <DialogTitle>Refund order {order.number}?</DialogTitle>
          <DialogDescription>
            {viaRazorpay
              ? `Refund ${formatPaise(order.totalPaise)} to the customer via Razorpay. The customer is emailed.`
              : viaMock
                ? `Refund ${formatPaise(order.totalPaise)} through the mock provider (test mode). The customer is emailed.`
                : "Mark as refunded (you refunded outside the store). The customer is emailed."}
            {canCancel(order.status) ? " Stock goes back on sale." : ""}
          </DialogDescription>
          <DialogFooter>
            <Button type="button" variant="secondary" className="h-11 px-4" onClick={() => setRefundOpen(false)}>Keep order</Button>
            <Button type="button" variant="destructive" className="h-11 px-4" onClick={refund} disabled={pending} data-testid="confirm-refund">
              {pending ? "Refunding…" : viaRazorpay || viaMock ? `Refund ${formatPaise(order.totalPaise)}` : "Mark as refunded"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/** The attention banner's "Mark resolved" button. */
export function ResolveAttentionButton({ orderId }: { orderId: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const resolve = () =>
    start(async () => {
      try {
        const r = await clearAttentionAction(orderId);
        if (!r.ok) {
          toast.error(r.message);
          return;
        }
        toast.success("Marked as resolved");
        router.refresh();
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });
  return (
    <Button type="button" variant="secondary" className="h-11 px-4" onClick={resolve} disabled={pending} data-testid="resolve-attention">
      {pending ? "Saving…" : "Mark resolved"}
    </Button>
  );
}
