import { Barcode } from "@/components/print/barcode";
import { BRAND } from "@/config/brand";
import { addressLines, formatPhone } from "@/lib/address-format";
import { formatDateIst } from "@/lib/dates";
import type { OrderView } from "@/server/services/order-records";
import type { StoreSettings } from "@/server/services/settings";

/** `last` marks the final document in a print run: every other one forces a page break after itself. */
export function LabelDocument({ order, settings, last = false }: { order: OrderView; settings: StoreSettings; last?: boolean }) {
  const middleLines = addressLines(order.ship).slice(0, -1);
  return (
    <article
      data-testid="shipping-label"
      className={`print-page${last ? " print-page-last" : ""} flex flex-col overflow-hidden border border-black/20 bg-white text-black shadow print:border-0 print:shadow-none`}
      style={{ width: "4in", height: "6in", padding: "0.2in" }}
    >
      <div className="border-2 border-black text-center text-[11pt] font-bold tracking-wide">PREPAID · DO NOT COLLECT CASH</div>

      <div className="mt-3">
        <p className="text-[9pt] font-bold">SHIP TO</p>
        <p className="text-[18pt] font-bold leading-tight">{order.ship.name}</p>
        {middleLines.map((l) => <p key={l} className="text-[12pt]">{l}</p>)}
        <p className="text-[13pt] font-bold">{order.ship.city}, {order.ship.state}</p>
        <p className="text-[22pt] font-black tracking-widest">{order.ship.pincode}</p>
        <p className="text-[14pt] font-bold">Ph: {formatPhone(order.ship.phone)}</p>
      </div>

      <div className="mt-3 flex flex-col items-center">
        <Barcode value={order.number} height={60} moduleWidth={2} />
        <p className="font-mono text-[14pt] font-bold">{order.number}</p>
        <p className="text-[10pt]">{order.itemCount} item(s) · {formatDateIst(order.paidAt ?? order.createdAt)}</p>
      </div>

      <div className="mt-auto border-t border-black pt-2 text-[9pt]">
        <p className="font-bold">FROM</p>
        <p>{settings.sellerName || BRAND.name}</p>
        <p className="whitespace-pre-line">{settings.sellerAddress}</p>
        {settings.whatsappNumber && <p>Ph: {settings.whatsappNumber}</p>}
      </div>
    </article>
  );
}
