import Link from "next/link";
import { PrintQueueList } from "@/components/admin/print-queue/print-queue-list";
import { listPrintQueue } from "@/server/services/print-queue";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Print queue" };
export const dynamic = "force-dynamic";

export default async function PrintQueuePage() {
  await requireAdminPage();
  const items = await listPrintQueue();
  const units = items.reduce((s, i) => s + i.quantity, 0);
  return (
    <div className="space-y-5" data-testid="print-queue">
      <div className="space-y-1">
        <h1 className="text-4xl md:text-5xl">Print queue</h1>
        <p className="text-sm text-text-muted">
          {items.length} {items.length === 1 ? "item" : "items"} to print · {units} {units === 1 ? "tee" : "tees"}
        </p>
        <p className="text-sm text-text-muted">Download the print files, print, then Mark printed. Orders move to Processing when all their custom items are printed.</p>
      </div>
      {items.length === 0 ? (
        <div className="rounded-md border border-border bg-surface p-6 text-center" data-testid="print-queue-empty">
          <p className="font-medium">Nothing to print. Nice.</p>
          <Link href="/admin/orders" className="inline-flex min-h-11 items-center text-sm text-text-muted underline-offset-4 hover:text-text hover:underline">Back to Orders</Link>
        </div>
      ) : (
        <PrintQueueList items={items} now={new Date()} />
      )}
    </div>
  );
}
