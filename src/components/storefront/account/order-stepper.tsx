import { formatDateIst } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CustomerOrderView as OrderView } from "@/server/services/order-records";

function StatusPanel({ title, date }: { title: string; date: Date | null }) {
  return (
    <div data-testid="order-stepper" role="status" className="rounded-md border border-border bg-surface p-4 text-sm font-medium">
      {title}{date ? ` on ${formatDateIst(date)}` : ""}
    </div>
  );
}

export function OrderStepper({ order }: { order: OrderView }) {
  if (order.status === "CANCELLED") return <StatusPanel title="Cancelled" date={order.cancelledAt} />;
  if (order.status === "EXPIRED") return <StatusPanel title="Not paid in time" date={null} />;
  if (order.status === "REFUNDED") return <StatusPanel title="Refunded" date={order.refundedAt} />;

  const steps = [
    { label: "Confirmed", at: order.paidAt },
    { label: "Packed", at: order.processingAt },
    { label: "Shipped", at: order.shippedAt },
    { label: "Delivered", at: order.deliveredAt },
  ];
  // Pending payment has not even confirmed the order yet, so nothing is "done" or "current" — every step is a plain future step.
  const pending = order.status === "PENDING_PAYMENT";
  const done = steps.map((_, i) => !pending && steps.slice(i).some((s) => s.at !== null));
  const currentIndex = pending ? -1 : done.findIndex((d) => !d);

  return (
    <ol aria-label="Order progress" data-testid="order-stepper" className="flex flex-col gap-4 sm:flex-row sm:gap-0">
      {steps.map((step, i) => {
        const isDone = done[i];
        const isCurrent = i === currentIndex;
        return (
          <li
            key={step.label}
            aria-current={isCurrent ? "step" : undefined}
            className="relative flex flex-1 items-start gap-3 sm:flex-col sm:items-center sm:gap-1.5 sm:text-center"
          >
            {i < steps.length - 1 && (
              <span aria-hidden className={cn("absolute left-1/2 top-3 hidden h-0.5 w-full sm:block", isDone ? "bg-brand" : "bg-border")} />
            )}
            <span
              className={cn(
                "relative z-10 flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                isDone ? "bg-brand text-brand-ink" : isCurrent ? "border-2 border-brand text-text" : "border border-border text-text-muted",
              )}
            >
              {i + 1}
            </span>
            <div>
              <p className={cn("text-sm font-medium", !isDone && !isCurrent && "text-text-muted")}>{step.label}</p>
              {step.at && <p className="text-xs text-text-muted">{formatDateIst(step.at)}</p>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}
