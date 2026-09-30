import {
  AlertTriangle, ArrowRight, Circle, Clock, IndianRupee, Mail, MailWarning, Receipt, StickyNote, Truck, Undo2, XCircle, type LucideIcon,
} from "lucide-react";
import { formatDateTimeIst } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AdminOrderEvent } from "@/server/services/admin-orders";

const ICONS: Record<string, { icon: LucideIcon; tone?: string }> = {
  CREATED: { icon: Receipt },
  PAID: { icon: IndianRupee, tone: "text-brand" },
  STATUS_CHANGED: { icon: ArrowRight },
  TRACKING_UPDATED: { icon: Truck },
  NOTE: { icon: StickyNote },
  EMAIL_SENT: { icon: Mail },
  EMAIL_FAILED: { icon: MailWarning, tone: "text-danger" },
  ATTENTION: { icon: AlertTriangle, tone: "text-amber-300" },
  PAYMENT_FAILED: { icon: XCircle, tone: "text-danger" },
  EXPIRED: { icon: Clock },
  REFUNDED: { icon: Undo2 },
};

export function OrderTimeline({ events }: { events: AdminOrderEvent[] }) {
  return (
    <section className="space-y-3 rounded-md border border-border bg-surface p-4" aria-labelledby="timeline-heading">
      <h2 id="timeline-heading" className="text-2xl">Timeline</h2>
      {events.length === 0 ? (
        <p className="text-sm text-text-muted">Nothing yet.</p>
      ) : (
        <ol aria-label="Timeline" className="space-y-3" data-testid="order-timeline">
          {events.map((e) => {
            const { icon: Icon, tone } = ICONS[e.type] ?? { icon: Circle };
            return (
              <li key={e.id} className="flex gap-3 text-sm">
                <Icon className={cn("mt-0.5 size-4 shrink-0 text-text-muted", tone)} aria-hidden />
                <div className="min-w-0">
                  <p className="break-words">{e.message}</p>
                  <p className="text-xs text-text-muted">
                    <time dateTime={e.createdAt.toISOString()}>{formatDateTimeIst(e.createdAt)}</time>
                    {e.actorName && <> · by {e.actorName}</>}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
