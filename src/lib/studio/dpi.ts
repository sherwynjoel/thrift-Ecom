import { DPI_BLURRY, DPI_WARN, UNITS_PER_INCH } from "./constants";

export type DpiLevel = "ok" | "low" | "blurry";

export function effectiveDpi(a: { pixelWidth: number; pixelHeight: number; printedWidthIn: number; printedHeightIn: number }): number {
  if (a.printedWidthIn <= 0 || a.printedHeightIn <= 0) return Infinity;
  return Math.floor(Math.min(a.pixelWidth / a.printedWidthIn, a.pixelHeight / a.printedHeightIn));
}

/** Image pixels versus the size it will print at. Scaled sizes are in canvas units (see UNITS_PER_INCH). */
export function objectDpi(o: { naturalWidth: number; naturalHeight: number; scaledWidth: number; scaledHeight: number }): number {
  return effectiveDpi({
    pixelWidth: o.naturalWidth,
    pixelHeight: o.naturalHeight,
    printedWidthIn: o.scaledWidth / UNITS_PER_INCH,
    printedHeightIn: o.scaledHeight / UNITS_PER_INCH,
  });
}

export function dpiLevel(dpi: number): DpiLevel {
  if (dpi < DPI_BLURRY) return "blurry";
  if (dpi < DPI_WARN) return "low";
  return "ok";
}

export function dpiMessage(level: DpiLevel): string | null {
  if (level === "blurry") return "May print blurry";
  if (level === "low") return "Low resolution: may look soft";
  return null;
}
