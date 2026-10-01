import Link from "next/link";
import { PrintItemActions } from "@/components/admin/print-queue/print-item-actions";
import { CustomPrintThumbs } from "@/components/storefront/custom-print-thumbs";
import { customPrintLabel } from "@/lib/custom-pricing";
import { ORDER_STATUS_LABEL } from "@/lib/order-status";
import { ageLabel } from "@/lib/print-queue";
import { cn } from "@/lib/utils";
import type { PrintQueueItem } from "@/server/services/print-queue";

const TWO_DAYS = 2 * 86_400_000;

export function PrintItemCard({ item, now }: { item: PrintQueueItem; now: Date }) {
  const old = item.paidAt !== null && now.getTime() - item.paidAt.getTime() >= TWO_DAYS;
  return (
    <li data-testid="print-queue-item" className="min-w-0 space-y-3 rounded-md border border-border p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <Link href={`/admin/orders/${item.orderId}`} className="inline-flex min-h-11 items-center break-all font-medium underline-offset-4 hover:underline">
          {item.orderNumber}
        </Link>
        <span
          className={cn("rounded-full px-2 py-0.5 text-xs font-medium", old ? "bg-amber-500/15 text-amber-200" : "bg-surface-raised text-text-muted")}
          title="Time since payment"
          data-testid="print-age"
        >
          {ageLabel(item.paidAt, now)}
        </span>
        <span className="text-xs text-text-muted">{ORDER_STATUS_LABEL[item.orderStatus]}</span>
      </div>
      <div className="flex flex-wrap gap-3">
        <CustomPrintThumbs front={item.frontPreviewUrl} back={item.backPreviewUrl} size={120} className="flex-wrap" />
        <div className="min-w-40 flex-1 space-y-0.5 text-sm">
          <p className="break-words">{item.productName}</p>
          <p className="font-bold">{item.colorName} / {item.size}</p>
          <p className="font-display text-3xl">× {item.quantity}</p>
          <p className="break-all font-mono text-xs text-text-muted">{item.sku}</p>
          <p className="text-xs font-medium text-brand">{customPrintLabel({ front: item.hasFrontPrint, back: item.hasBackPrint })}</p>
        </div>
      </div>
      <PrintItemActions
        itemId={item.itemId}
        orderNumber={item.orderNumber}
        customerName={item.customerName}
        customerPhone={item.customerPhone}
        hasFront={item.hasFrontPrint}
        hasBack={item.hasBackPrint}
        printedAt={null}
        heldAt={item.heldAt}
        holdNote={item.holdNote}
      />
    </li>
  );
}
