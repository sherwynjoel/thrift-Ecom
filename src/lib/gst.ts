import type { OrderView } from "@/server/services/order-records";

export const HSN_TSHIRT = "6109";
export const SAC_SHIPPING = "9965";

export interface GstSettings { gstRateLowPct: number; gstRateHighPct: number; gstThresholdPaise: number; sellerState: string }
export interface InvoiceItemInput { description: string; quantity: number; unitPricePaise: number; lineTotalPaise: number }
export interface InvoiceLine {
  description: string; hsn: string; quantity: number; ratePct: number; grossPaise: number; discountPaise: number;
  taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number;
}
export interface InvoiceTotals { grossPaise: number; discountPaise: number; taxablePaise: number; cgstPaise: number; sgstPaise: number; igstPaise: number; totalPaise: number }
export interface Invoice { intraState: boolean; lines: InvoiceLine[]; totals: InvoiceTotals }

export function gstRateFor(unitPricePaise: number, s: GstSettings): number {
  return unitPricePaise <= s.gstThresholdPaise ? s.gstRateLowPct : s.gstRateHighPct;
}

export function splitInclusive(grossPaise: number, ratePct: number): { taxablePaise: number; taxPaise: number } {
  const taxablePaise = Math.round((grossPaise * 100) / (100 + ratePct));
  return { taxablePaise, taxPaise: grossPaise - taxablePaise };
}

export function allocateDiscount(amounts: number[], discountPaise: number): number[] {
  const total = amounts.reduce((a, b) => a + b, 0);
  if (total <= 0 || discountPaise <= 0) return amounts.map(() => 0);
  const d = Math.min(discountPaise, total);
  const raw = amounts.map((a) => (a * d) / total);
  const out = raw.map((r) => Math.floor(r));
  let rest = d - out.reduce((a, b) => a + b, 0);
  const order = raw.map((r, i) => ({ i, frac: r - Math.floor(r) })).sort((a, b) => b.frac - a.frac || a.i - b.i);
  for (const { i } of order) {
    if (rest <= 0) break;
    out[i] += 1;
    rest -= 1;
  }
  return out;
}

export function buildInvoice(args: { items: InvoiceItemInput[]; discountPaise: number; shippingPaise: number; shipState: string; settings: GstSettings }): Invoice {
  const { items, settings } = args;
  const intraState = settings.sellerState !== "" && settings.sellerState === args.shipState;
  const discounts = allocateDiscount(items.map((i) => i.lineTotalPaise), args.discountPaise);
  const rows = items.map((it, i) => ({
    description: it.description, hsn: HSN_TSHIRT, quantity: it.quantity, ratePct: gstRateFor(it.unitPricePaise, settings),
    grossPaise: it.lineTotalPaise, discountPaise: discounts[i],
  }));
  if (args.shippingPaise > 0) {
    rows.push({ description: "Shipping charges", hsn: SAC_SHIPPING, quantity: 1, ratePct: Math.max(0, ...rows.map((r) => r.ratePct)), grossPaise: args.shippingPaise, discountPaise: 0 });
  }
  const lines: InvoiceLine[] = rows.map((r) => {
    const net = r.grossPaise - r.discountPaise;
    const { taxablePaise, taxPaise } = splitInclusive(net, r.ratePct);
    const cgstPaise = intraState ? Math.floor(taxPaise / 2) : 0;
    const sgstPaise = intraState ? taxPaise - cgstPaise : 0;
    return { ...r, taxablePaise, cgstPaise, sgstPaise, igstPaise: intraState ? 0 : taxPaise, totalPaise: net };
  });
  const sum = (k: keyof InvoiceTotals) => lines.reduce((s, l) => s + l[k], 0);
  return {
    intraState,
    lines,
    totals: { grossPaise: sum("grossPaise"), discountPaise: sum("discountPaise"), taxablePaise: sum("taxablePaise"), cgstPaise: sum("cgstPaise"), sgstPaise: sum("sgstPaise"), igstPaise: sum("igstPaise"), totalPaise: sum("totalPaise") },
  };
}

export function invoiceFromOrder(order: OrderView, settings: GstSettings): Invoice {
  return buildInvoice({
    items: order.items.map((i) => ({ description: `${i.productName} (${i.colorName} / ${i.size}) · ${i.sku}`, quantity: i.quantity, unitPricePaise: i.unitPricePaise, lineTotalPaise: i.lineTotalPaise })),
    discountPaise: order.discountPaise, shippingPaise: order.shippingPaise, shipState: order.ship.state, settings,
  });
}
