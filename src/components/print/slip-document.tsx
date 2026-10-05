import { Barcode } from "@/components/print/barcode";
import { BRAND } from "@/config/brand";
import { addressLines, formatPhone } from "@/lib/address-format";
import { customPrintLabel, isCustomItem, printSidesOf } from "@/lib/custom-pricing";
import { formatDateIst } from "@/lib/dates";
import type { OrderView } from "@/server/services/order-records";
import type { StoreSettings } from "@/server/services/settings";

/** `last` marks the final document in a print run: every other one forces a page break after itself. */
export function SlipDocument({ order, settings, last = false }: { order: OrderView; settings: StoreSettings; last?: boolean }) {
  const brand = settings.sellerName || BRAND.name;
  return (
    <article data-testid="packing-slip" className={`print-page${last ? " print-page-last" : ""} mx-auto w-full max-w-[210mm] bg-white p-6 text-[12px] text-black sm:p-10`}>
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-black/20 pb-4">
        <div>
          <p className="text-xl font-bold uppercase">{brand}</p>
          <p className="text-lg font-bold">PACKING SLIP</p>
        </div>
        <div className="text-right">
          <p className="text-lg font-bold">{order.number}</p>
          <Barcode value={order.number} height={36} moduleWidth={1.5} />
          <p>Paid: {formatDateIst(order.paidAt ?? order.createdAt)}</p>
        </div>
      </header>

      <section className="border-b border-black/20 py-4">
        <p className="font-bold">Ship to</p>
        <p>{order.ship.name}</p>
        {addressLines(order.ship).map((l) => <p key={l}>{l}</p>)}
        <p>Phone: {formatPhone(order.ship.phone)}</p>
      </section>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[560px] border-collapse">
          <thead>
            <tr className="border-b border-black/40 text-left">
              <th className="w-8 py-1"><span className="sr-only">Packed</span></th>
              <th className="w-12 pr-2">Img</th>
              <th className="pr-2">Product</th>
              <th className="pr-2">Colour / Size</th>
              <th className="pr-2">SKU</th>
              <th className="pr-2 text-right">Qty</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((i) => (
              <tr key={i.id} className="border-b border-black/10 align-middle">
                <td className="py-2">
                  <span className="inline-block size-4 border-2 border-black" aria-hidden />
                </td>
                <td className="pr-2">
                  <div className="flex gap-1">
                    {(isCustomItem(i) ? [i.designFrontPreviewUrl, i.designBackPreviewUrl] : [i.imageUrl]).filter((u): u is string => u !== null).map((u) => (
                      // eslint-disable-next-line @next/next/no-img-element -- print view, no optimisation needed
                      <img key={u} src={u} alt="" width={40} height={40} className="size-10 object-cover" data-testid="slip-item-image" />
                    ))}
                  </div>
                </td>
                <td className="pr-2">{i.productName}</td>
                <td className="pr-2 font-bold">
                  {i.colorName} / {i.size}
                  {isCustomItem(i) && <span className="block" data-testid="slip-custom-print">{customPrintLabel(printSidesOf(i))}</span>}
                </td>
                <td className="pr-2 font-mono">{i.sku}</td>
                <td className="text-right text-[16px] font-bold">{i.quantity}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="font-bold">
              <td colSpan={5} className="pt-2 text-right pr-2">Total units</td>
              <td className="pt-2 text-right text-[16px]">{order.itemCount}</td>
            </tr>
          </tfoot>
        </table>
      </div>

      {order.customerNote && (
        <div className="mt-4 border border-black p-3">
          <p className="font-bold">NOTE FROM CUSTOMER</p>
          <p className="whitespace-pre-line">{order.customerNote}</p>
        </div>
      )}

      <footer className="mt-8 space-y-4 text-black/80">
        <p>Packed by ________&nbsp;&nbsp;&nbsp;&nbsp;Checked by ________</p>
        <p>Thank you for shopping with {brand}!</p>
      </footer>
    </article>
  );
}
