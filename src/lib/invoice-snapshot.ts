import type { GstSettings } from "@/lib/gst";

/**
 * Seller and GST inputs frozen onto an order when it becomes PAID (`Order.invoiceSnapshot`), so an
 * issued invoice never changes when store settings change later (a new GSTIN, a rate or threshold
 * change, a different seller state). Pure and client-safe.
 */
export interface InvoiceSnapshot extends GstSettings {
  v: 1;
  sellerName: string;
  sellerAddress: string;
  gstin: string | null;
  /** ISO timestamp: the invoice date (when the order was paid). */
  invoiceDate: string;
}

/** What an invoice renders with: the snapshot when the order has one, else the current settings. */
export interface InvoiceInputs extends GstSettings {
  sellerName: string;
  sellerAddress: string;
  gstin: string | null;
  invoiceDate: Date;
}

type SettingsLike = GstSettings & { sellerName: string; sellerAddress: string; gstin: string | null };

export function invoiceSnapshotFrom(s: SettingsLike, paidAt: Date): InvoiceSnapshot {
  return {
    v: 1,
    sellerName: s.sellerName,
    sellerAddress: s.sellerAddress,
    sellerState: s.sellerState,
    gstin: s.gstin || null,
    gstRateLowPct: s.gstRateLowPct,
    gstRateHighPct: s.gstRateHighPct,
    gstThresholdPaise: s.gstThresholdPaise,
    invoiceDate: paidAt.toISOString(),
  };
}

const isStr = (x: unknown): x is string => typeof x === "string";
const isInt = (x: unknown): x is number => typeof x === "number" && Number.isInteger(x);

/** Reads `Order.invoiceSnapshot` (Prisma JSON). Anything malformed is treated as "no snapshot". */
export function parseInvoiceSnapshot(json: unknown): InvoiceSnapshot | null {
  if (!json || typeof json !== "object" || Array.isArray(json)) return null;
  const o = json as Record<string, unknown>;
  if (o.v !== 1) return null;
  if (!isStr(o.sellerName) || !isStr(o.sellerAddress) || !isStr(o.sellerState) || !isStr(o.invoiceDate)) return null;
  if (!(o.gstin === null || isStr(o.gstin))) return null;
  if (!isInt(o.gstRateLowPct) || !isInt(o.gstRateHighPct) || !isInt(o.gstThresholdPaise)) return null;
  if (Number.isNaN(new Date(o.invoiceDate).getTime())) return null;
  return {
    v: 1, sellerName: o.sellerName, sellerAddress: o.sellerAddress, sellerState: o.sellerState, gstin: o.gstin,
    gstRateLowPct: o.gstRateLowPct, gstRateHighPct: o.gstRateHighPct, gstThresholdPaise: o.gstThresholdPaise, invoiceDate: o.invoiceDate,
  };
}

/** Invoice inputs for an order: its snapshot when present; older orders (no snapshot) fall back to the current settings. */
export function invoiceInputsFor(
  order: { invoiceSnapshot: InvoiceSnapshot | null; paidAt: Date | null; createdAt: Date },
  settings: SettingsLike,
): InvoiceInputs {
  const snap = order.invoiceSnapshot;
  if (snap) {
    return {
      sellerName: snap.sellerName, sellerAddress: snap.sellerAddress, sellerState: snap.sellerState, gstin: snap.gstin,
      gstRateLowPct: snap.gstRateLowPct, gstRateHighPct: snap.gstRateHighPct, gstThresholdPaise: snap.gstThresholdPaise,
      invoiceDate: new Date(snap.invoiceDate),
    };
  }
  return {
    sellerName: settings.sellerName, sellerAddress: settings.sellerAddress, sellerState: settings.sellerState, gstin: settings.gstin || null,
    gstRateLowPct: settings.gstRateLowPct, gstRateHighPct: settings.gstRateHighPct, gstThresholdPaise: settings.gstThresholdPaise,
    invoiceDate: order.paidAt ?? order.createdAt,
  };
}
