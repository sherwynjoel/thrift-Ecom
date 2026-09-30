import { BRAND } from "@/config/brand";
import { addressLines, formatPhone } from "@/lib/address-format";
import { formatDateIst } from "@/lib/dates";
import { invoiceFromOrder } from "@/lib/gst";
import { formatPaise } from "@/lib/money";
import type { OrderView } from "@/server/services/order-records";
import type { StoreSettings } from "@/server/services/settings";

const rupees = (p: number) => (p / 100).toFixed(2);

/** `last` marks the final document in a print run: every other one forces a page break after itself. */
export function InvoiceDocument({ order, settings, last = false }: { order: OrderView; settings: StoreSettings; last?: boolean }) {
  const inv = invoiceFromOrder(order, settings);
  const title = settings.gstin ? "Tax Invoice" : "Invoice";
  return (
    <article className={`print-page${last ? " print-page-last" : ""} mx-auto w-full max-w-[210mm] bg-white p-6 text-[12px] leading-snug text-black sm:p-10`} data-testid="invoice">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/20 pb-4">
        <div>
          <p className="text-xl font-bold uppercase">{settings.sellerName || BRAND.name}</p>
          <p className="whitespace-pre-line">{settings.sellerAddress}</p>
          {settings.sellerState && <p>State: {settings.sellerState}</p>}
          {settings.gstin && <p>GSTIN: {settings.gstin}</p>}
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{title}</p>
          <p>Invoice no: {order.number}</p>
          <p>Date: {formatDateIst(order.paidAt ?? order.createdAt)}</p>
          <p>Place of supply: {order.ship.state}</p>
        </div>
      </header>
      <section className="grid gap-4 border-b border-black/20 py-4 sm:grid-cols-2">
        <div>
          <p className="font-bold">Bill to / Ship to</p>
          <p>{order.ship.name}</p>
          {addressLines(order.ship).map((l) => <p key={l}>{l}</p>)}
          <p>Phone: {formatPhone(order.ship.phone)}</p>
          <p>{order.email}</p>
        </div>
      </section>
      <div className="overflow-x-auto">
        <table className="mt-4 w-full min-w-[640px] border-collapse">
          <thead>
            <tr className="border-b border-black/40 text-left">
              <th className="py-1 pr-2">#</th><th className="pr-2">Description</th><th className="pr-2">HSN/SAC</th><th className="pr-2 text-right">Qty</th>
              <th className="pr-2 text-right">Gross</th><th className="pr-2 text-right">Discount</th><th className="pr-2 text-right">Taxable</th>
              {inv.intraState ? <><th className="pr-2 text-right">CGST</th><th className="pr-2 text-right">SGST</th></> : <th className="pr-2 text-right">IGST</th>}
              <th className="text-right">Total</th>
            </tr>
          </thead>
          <tbody>
            {inv.lines.map((l, i) => (
              <tr key={i} className="border-b border-black/10 align-top">
                <td className="py-1 pr-2">{i + 1}</td><td className="pr-2">{l.description}</td><td className="pr-2">{l.hsn}</td><td className="pr-2 text-right">{l.quantity}</td>
                <td className="pr-2 text-right">{rupees(l.grossPaise)}</td><td className="pr-2 text-right">{rupees(l.discountPaise)}</td><td className="pr-2 text-right">{rupees(l.taxablePaise)}</td>
                {inv.intraState
                  ? <><td className="pr-2 text-right">{rupees(l.cgstPaise)} <span className="text-black/60">({l.ratePct / 2}%)</span></td><td className="pr-2 text-right">{rupees(l.sgstPaise)} <span className="text-black/60">({l.ratePct / 2}%)</span></td></>
                  : <td className="pr-2 text-right">{rupees(l.igstPaise)} <span className="text-black/60">({l.ratePct}%)</span></td>}
                <td className="text-right">{rupees(l.totalPaise)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td colSpan={6} className="pt-2 text-right pr-2">Totals</td>
              <td className="pt-2 pr-2 text-right">{rupees(inv.totals.taxablePaise)}</td>
              {inv.intraState ? <><td className="pt-2 pr-2 text-right">{rupees(inv.totals.cgstPaise)}</td><td className="pt-2 pr-2 text-right">{rupees(inv.totals.sgstPaise)}</td></> : <td className="pt-2 pr-2 text-right">{rupees(inv.totals.igstPaise)}</td>}
              <td className="pt-2 text-right">{rupees(inv.totals.totalPaise)}</td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="mt-4 text-right text-base font-bold">Amount paid: {formatPaise(order.totalPaise)}</p>
      <footer className="mt-6 space-y-1 border-t border-black/20 pt-3 text-black/70">
        <p>All prices are inclusive of GST. Amounts in ₹.</p>
        {order.providerPaymentId && <p>Payment reference: {order.providerPaymentId}</p>}
        <p>This is a computer-generated invoice and does not need a signature.</p>
      </footer>
    </article>
  );
}
