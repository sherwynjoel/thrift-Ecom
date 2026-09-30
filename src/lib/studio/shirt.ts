import { CANVAS_HEIGHT, CANVAS_WIDTH, PRINT_AREA, type DesignSide } from "./constants";

const HEX = /^#[0-9a-f]{6}$/i;

export function safeHex(hex: string | null | undefined, fallback = "#f5f5f5"): string {
  return typeof hex === "string" && HEX.test(hex) ? hex.toLowerCase() : fallback;
}

export function shadeHex(hex: string, amount: number): string {
  const n = parseInt(safeHex(hex).slice(1), 16);
  const c = (shift: number) => Math.min(255, Math.max(0, ((n >> shift) & 255) + amount));
  return `#${((c(16) << 16) | (c(8) << 8) | c(0)).toString(16).padStart(6, "0")}`;
}

export function isDarkHex(hex: string): boolean {
  const n = parseInt(safeHex(hex).slice(1), 16);
  const lum = 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255);
  return lum / 255 < 0.5;
}

const BODY = "M250 180 L330 140 Q400 200 470 140 L550 180 L680 260 L620 360 L560 320 L560 880 L240 880 L240 320 L180 360 L120 260 Z";
const NECK: Record<DesignSide, string> = { front: "M330 140 Q400 230 470 140", back: "M330 140 Q400 172 470 140" };

/**
 * Flat T-shirt mockup in the canvas coordinate space (viewBox 0 0 800 1000). Every interpolated value is a
 * number or a regex-validated hex, so the string is safe for dangerouslySetInnerHTML and for an <img> Blob.
 */
export function shirtSvgMarkup(hex: string, side: DesignSide, opts: { guide?: boolean; background?: string | null } = {}): string {
  const fill = safeHex(hex);
  const edge = shadeHex(fill, -28);
  const id = `tee-shade-${side}`;
  const bg = opts.background ? `<rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="${safeHex(opts.background, "#f2f2f2")}"/>` : "";
  const guideColor = isDarkHex(fill) ? "#ffffff" : "#111111";
  const guide = opts.guide
    ? `<rect data-guide="print-area" x="${PRINT_AREA.left}" y="${PRINT_AREA.top}" width="${PRINT_AREA.width}" height="${PRINT_AREA.height}" fill="none" stroke="${guideColor}" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="8 6"/>`
    : "";
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}">${bg}<defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="0.10"/><stop offset="0.5" stop-color="#fff" stop-opacity="0.07"/><stop offset="1" stop-color="#000" stop-opacity="0.12"/></linearGradient></defs><path d="${BODY}" fill="${fill}" stroke="${edge}" stroke-width="6" stroke-linejoin="round"/><path d="${BODY}" fill="url(#${id})"/><path d="${NECK[side]}" fill="none" stroke="${edge}" stroke-width="6"/><path d="M300 862 Q400 846 500 862" fill="none" stroke="#000" stroke-opacity="0.08" stroke-width="4"/>${guide}</svg>`;
}
