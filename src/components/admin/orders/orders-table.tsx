"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { bulkMarkProcessingAction } from "@/app/admin/orders/actions";
import { Button } from "@/components/ui/button";
import { formatDateIst } from "@/lib/dates";
import { formatPaise } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { AdminOrderRow } from "@/server/services/admin-orders";
import { OrderStatusBadge } from "./order-status-badge";

const GENERIC_ERROR = "Something went wrong. Please try again.";
// Mobile: [checkbox | number, customer | total, status] in two lines. md+: one row per order, eight columns.
const ROW_GRID = "grid grid-cols-[44px_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 md:grid-cols-[44px_120px_110px_minmax(0,1fr)_120px_60px_100px_150px]";
// Resets the mobile-only explicit placement so md+ falls back to auto-placement in DOM order.
const MD_AUTO = "md:col-start-auto md:row-start-auto md:row-span-1";

function AgeBadge({ days }: { days: number }) {
  const late = days > 2;
  return (
    <span
      className={cn("inline-flex rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums", late ? "bg-amber-500/15 text-amber-300" : "text-text-muted")}
      title={`Paid ${days} day${days === 1 ? "" : "s"} ago, not shipped`}
      data-testid="order-age"
    >
      {days}d
    </span>
  );
}

export function OrdersTable({ rows, exportQuery }: { rows: AdminOrderRow[]; exportQuery: string }) {
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [pending, start] = useTransition();
  const router = useRouter();
  const allRef = useRef<HTMLInputElement>(null);

  // Keep the selection to orders still on screen (after a refresh an order may have left this tab).
  const chosen = rows.filter((r) => selected.has(r.id)).map((r) => r.id);
  const count = chosen.length;
  const allOnPage = count > 0 && count === rows.length;

  useEffect(() => {
    if (allRef.current) allRef.current.indeterminate = count > 0 && !allOnPage;
  }, [count, allOnPage]);

  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(rows.map((r) => r.id)));
  const clear = () => setSelected(new Set());

  const markProcessing = () =>
    start(async () => {
      try {
        const r = await bulkMarkProcessingAction(chosen);
        if (!r.ok) {
          toast.error(r.message);
          return;
        }
        const skipped = chosen.length - r.data.updated;
        toast.success(`${r.data.updated} marked processing${skipped > 0 ? ` (${skipped} skipped: not in Paid)` : ""}`);
        clear();
        router.refresh();
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });

  return (
    <div className={cn(count > 0 && "pb-28 md:pb-0")}>
      <div className={cn(ROW_GRID, "border-b border-border text-xs uppercase tracking-wide text-text-muted")}>
        <label className="flex size-11 items-center justify-center">
          <input ref={allRef} type="checkbox" className="size-5 accent-brand" aria-label="Select all on this page" checked={allOnPage} onChange={toggleAll} />
        </label>
        <span className="md:hidden">{count > 0 ? `${count} selected` : "Select all"}</span>
        <span className="hidden md:block">Order</span>
        <span className="hidden md:block">Date</span>
        <span className="hidden md:block">Customer</span>
        <span className="hidden md:block">Ship to</span>
        <span className="hidden text-right md:block">Items</span>
        <span className="hidden text-right md:block">Total</span>
        <span className="hidden md:block">Status</span>
      </div>
      <ul data-testid="orders-table">
        {rows.map((r) => {
          const isOn = selected.has(r.id);
          return (
            <li
              key={r.id}
              data-testid="order-row"
              className={cn(ROW_GRID, "relative border-b border-border py-2 hover:bg-surface/60 md:py-1", isOn && "bg-surface")}
            >
              <label className={cn("relative z-10 col-start-1 row-span-2 row-start-1 flex size-11 items-center justify-center", MD_AUTO)}>
                <input type="checkbox" className="size-5 accent-brand" aria-label={`Select ${r.number}`} checked={isOn} onChange={() => toggle(r.id)} />
              </label>
              <div className={cn("col-start-2 row-start-1 min-w-0", MD_AUTO)}>
                {/* The link covers the whole row (after:inset-0) so a tap anywhere opens the order. */}
                <Link href={`/admin/orders/${r.id}`} className="font-medium after:absolute after:inset-0 hover:underline">
                  {r.number}
                </Link>
                <span className="text-xs text-text-muted md:hidden"> · {formatDateIst(r.createdAt)}</span>
              </div>
              <span className="hidden text-sm text-text-muted md:block">{formatDateIst(r.createdAt)}</span>
              <div className={cn("col-start-2 row-start-2 min-w-0 text-sm", MD_AUTO)}>
                <p className="truncate">{r.customerName}</p>
                <p className="hidden truncate text-xs text-text-muted md:block">{r.email}</p>
                <p className="truncate text-xs text-text-muted md:hidden">
                  {r.city} {r.pincode} · {r.itemCount} {r.itemCount === 1 ? "item" : "items"}
                </p>
              </div>
              <div className="hidden min-w-0 text-sm md:block">
                <p className="truncate">{r.city}</p>
                <p className="text-xs text-text-muted">{r.pincode}</p>
              </div>
              <span className="hidden text-right text-sm tabular-nums md:block">{r.itemCount}</span>
              <span className={cn("col-start-3 row-start-1 text-right text-sm font-medium tabular-nums", MD_AUTO)}>{formatPaise(r.totalPaise)}</span>
              <div className={cn("col-start-3 row-start-2 flex items-center justify-end gap-1.5 md:justify-start", MD_AUTO)}>
                {r.needsAttention && (
                  <span className="inline-flex size-2.5 rounded-full bg-danger" title="Needs attention" data-testid="attention-dot">
                    <span className="sr-only">Needs attention</span>
                  </span>
                )}
                <OrderStatusBadge status={r.status} />
                {r.unshippedDays !== null && <AgeBadge days={r.unshippedDays} />}
              </div>
            </li>
          );
        })}
      </ul>

      {count > 0 && (
        <div
          className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-bg p-3 md:sticky md:bottom-4 md:mt-4 md:rounded-md md:border print:hidden"
          role="region"
          aria-label="Bulk actions"
          data-testid="bulk-bar"
        >
          <div className="flex flex-wrap items-center gap-2">
            <p className="mr-auto text-sm font-medium" aria-live="polite">{count} selected</p>
            <Button type="button" variant="ghost" className="h-11 px-4 md:order-last" onClick={clear}>
              Clear
            </Button>
            <div className="grid w-full grid-cols-2 gap-2 md:flex md:w-auto md:flex-wrap">
              {/* Print buttons come first: printing labels/slips is the most-used bulk action while packing. */}
              <Button
                variant="secondary"
                className="h-11 px-4"
                render={<a href={`/admin/orders/print?doc=label&ids=${chosen.map(encodeURIComponent).join(",")}`} target="_blank" rel="noopener" />}
                nativeButton={false}
                data-testid="bulk-print-labels"
              >
                Print labels
              </Button>
              <Button
                variant="secondary"
                className="h-11 px-4"
                render={<a href={`/admin/orders/print?doc=slip&ids=${chosen.map(encodeURIComponent).join(",")}`} target="_blank" rel="noopener" />}
                nativeButton={false}
                data-testid="bulk-print-slips"
              >
                Print slips
              </Button>
              <Button type="button" className="h-11 px-4" onClick={markProcessing} disabled={pending} data-testid="bulk-processing">
                {pending ? "Updating…" : "Mark processing"}
              </Button>
              <Button
                variant="secondary"
                className="h-11 px-4"
                render={<a href={`/admin/orders/export?ids=${chosen.map(encodeURIComponent).join(",")}`} />}
                nativeButton={false}
                data-testid="bulk-export"
              >
                Export CSV
              </Button>
            </div>
          </div>
          <a href={`/admin/orders/export${exportQuery ? `?${exportQuery}` : ""}`} className="mt-1 inline-flex min-h-11 items-center text-xs text-text-muted underline-offset-4 hover:text-text hover:underline">
            Export all matching orders instead
          </a>
        </div>
      )}
    </div>
  );
}
