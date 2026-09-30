import { describe, expect, it } from "vitest";
import { allocateDiscount, buildInvoice, gstRateFor, splitInclusive } from "@/lib/gst";

const settings = { gstRateLowPct: 5, gstRateHighPct: 18, gstThresholdPaise: 250000, sellerState: "Tamil Nadu" };

describe("GST helpers", () => {
  it("picks the rate by unit price with an inclusive threshold", () => {
    expect(gstRateFor(250000, settings)).toBe(5);
    expect(gstRateFor(250001, settings)).toBe(18);
  });

  it("extracts tax from inclusive amounts", () => {
    expect(splitInclusive(105000, 5)).toEqual({ taxablePaise: 100000, taxPaise: 5000 });
    expect(splitInclusive(59900, 5)).toEqual({ taxablePaise: 57048, taxPaise: 2852 });
  });

  it("allocates a discount exactly by largest remainder", () => {
    expect(allocateDiscount([59900, 40100], 10000)).toEqual([5990, 4010]);
    expect(allocateDiscount([1, 1, 1], 2)).toEqual([1, 1, 0]);
    expect(allocateDiscount([100], 500)).toEqual([100]);
    expect(allocateDiscount([0, 0], 10)).toEqual([0, 0]);
  });
});

describe("buildInvoice", () => {
  it("splits CGST and SGST within the seller's state and keeps the order total", () => {
    const inv = buildInvoice({
      items: [{ description: "Tee (Black / M)", quantity: 2, unitPricePaise: 59900, lineTotalPaise: 119800 }],
      discountPaise: 19900, shippingPaise: 0, shipState: "Tamil Nadu", settings,
    });
    expect(inv.intraState).toBe(true);
    expect(inv.lines).toHaveLength(1);
    expect(inv.lines[0]).toMatchObject({ hsn: "6109", ratePct: 5, grossPaise: 119800, discountPaise: 19900, taxablePaise: 95143, cgstPaise: 2378, sgstPaise: 2379, igstPaise: 0, totalPaise: 99900 });
    expect(inv.totals.totalPaise).toBe(99900);
  });

  it("uses IGST across states and taxes shipping at the highest item rate", () => {
    const inv = buildInvoice({
      items: [{ description: "Premium Tee", quantity: 1, unitPricePaise: 300000, lineTotalPaise: 300000 }],
      discountPaise: 0, shippingPaise: 7900, shipState: "Karnataka", settings,
    });
    expect(inv.intraState).toBe(false);
    expect(inv.lines[0]).toMatchObject({ ratePct: 18, taxablePaise: 254237, igstPaise: 45763, cgstPaise: 0 });
    expect(inv.lines[1]).toMatchObject({ description: "Shipping charges", hsn: "9965", ratePct: 18, taxablePaise: 6695, igstPaise: 1205 });
    expect(inv.totals).toMatchObject({ igstPaise: 46968, totalPaise: 307900 });
  });

  it("treats an unset seller state as inter-state", () => {
    const inv = buildInvoice({ items: [{ description: "Tee", quantity: 1, unitPricePaise: 59900, lineTotalPaise: 59900 }], discountPaise: 0, shippingPaise: 0, shipState: "", settings: { ...settings, sellerState: "" } });
    expect(inv.intraState).toBe(false);
  });
});
