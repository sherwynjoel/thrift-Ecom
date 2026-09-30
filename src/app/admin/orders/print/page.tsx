import { notFound } from "next/navigation";
import { InvoiceDocument } from "@/components/print/invoice-document";
import { LabelDocument } from "@/components/print/label-document";
import { PageSize } from "@/components/print/page-size";
import { PrintToolbar } from "@/components/print/print-toolbar";
import { SlipDocument } from "@/components/print/slip-document";
import { isPaidStatus } from "@/lib/order-status";
import { getOrdersForPrint } from "@/server/services/admin-orders";
import { getSettings } from "@/server/services/settings";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "Print" };
export const dynamic = "force-dynamic";

type Doc = "label" | "slip" | "invoice";
const DOCS: Doc[] = ["label", "slip", "invoice"];

export default async function PrintOrdersPage({ searchParams }: { searchParams: Promise<{ ids?: string; doc?: string }> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const doc = DOCS.find((d) => d === sp.doc);
  if (!doc) notFound();
  const ids = (sp.ids ?? "").split(",").map((s) => s.trim()).filter(Boolean).slice(0, 100);
  const [orders, settings] = await Promise.all([getOrdersForPrint(ids), getSettings()]);
  const printable = doc === "invoice" ? orders.filter((o) => isPaidStatus(o.status) || o.status === "REFUNDED") : orders;
  const skipped = orders.length - printable.length;
  return (
    <div className="-m-4 min-h-dvh bg-neutral-200 sm:-m-8 print:m-0 print:bg-white" data-testid="print-view">
      <PageSize size={doc === "label" ? "4in 6in" : "A4"} margin={doc === "label" ? "0" : "12mm"} />
      <PrintToolbar backHref={ids.length === 1 ? `/admin/orders/${ids[0]}` : "/admin/orders"} backLabel="Orders" autoPrint={printable.length > 0} />
      {(printable.length === 0 || skipped > 0) && (
        <p className="no-print p-4 text-sm text-black" role="status">
          {printable.length === 0 ? "Nothing to print. Select orders first." : `${skipped} unpaid order(s) skipped: invoices exist only for paid orders.`}
        </p>
      )}
      <div className="flex flex-col items-center gap-6 p-4 print:block print:p-0">
        {printable.map((o, i) => (
          <div key={o.id} className="w-full overflow-x-auto print:overflow-visible">
            <div className="mx-auto w-fit shadow print:shadow-none">
              {doc === "label" ? (
                <LabelDocument order={o} settings={settings} last={i === printable.length - 1} />
              ) : doc === "slip" ? (
                <SlipDocument order={o} settings={settings} last={i === printable.length - 1} />
              ) : (
                <InvoiceDocument order={o} settings={settings} last={i === printable.length - 1} />
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
