export interface CustomFees { frontPaise: number; backPaise: number }
export interface DesignSides { front: boolean; back: boolean }

export const NO_CUSTOM_FEES: CustomFees = { frontPaise: 0, backPaise: 0 };

export function customFeesOf(s: { customFrontFeePaise: number; customBackFeePaise: number }): CustomFees {
  return { frontPaise: s.customFrontFeePaise, backPaise: s.customBackFeePaise };
}

/** A side "has objects" exactly when it has a print file: the studio never uploads files for an empty side. */
export function designSides(d: { frontPrintKey: string | null; backPrintKey: string | null }): DesignSides {
  return { front: d.frontPrintKey !== null, back: d.backPrintKey !== null };
}

/** An order line's printed sides, read from its preview snapshots: every printed side has a preview, and customers never see the print URLs. */
type PreviewSnapshots = { designFrontPreviewUrl: string | null; designBackPreviewUrl: string | null };

export function printSidesOf(i: PreviewSnapshots): DesignSides | null {
  const sides = { front: i.designFrontPreviewUrl !== null, back: i.designBackPreviewUrl !== null };
  return sides.front || sides.back ? sides : null;
}

export function isCustomItem(i: PreviewSnapshots): boolean {
  return printSidesOf(i) !== null;
}

/** Identifies a bag line: one plain line per variant, one line per design. */
export function bagLineKey(variantId: string, designId: string | null): string {
  return `${variantId}|${designId ?? ""}`;
}

export function customFeePaise(sides: DesignSides, fees: CustomFees): number {
  return (sides.front ? fees.frontPaise : 0) + (sides.back ? fees.backPaise : 0);
}

export function customUnitPricePaise(variantPricePaise: number, sides: DesignSides | null, fees: CustomFees): number {
  return variantPricePaise + (sides ? customFeePaise(sides, fees) : 0);
}

export function customPrintLabel(sides: DesignSides | null): string | null {
  if (!sides || (!sides.front && !sides.back)) return null;
  if (sides.front && sides.back) return "Custom print: front + back";
  return sides.front ? "Custom print: front" : "Custom print: back";
}
