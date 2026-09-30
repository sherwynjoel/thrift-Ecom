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

/**
 * Key points of the flat-lay tee in canvas units (viewBox 0 0 800 1000, 20 units per inch), left half only —
 * the right half mirrors around x = 400. The body is 460 wide (23 in chest) and 530 tall from the shoulder
 * line to the hem (≈ 1 : 1.15). The 12 × 16 in print area sits centred on the chest, 2.5 in below the front neck.
 */
export const SHIRT_GEOMETRY = {
  neckX: 330, neckY: 212, // high point of the shoulder, where the collar meets the shoulder seam
  shoulderX: 170, shoulderY: 255, // shoulder point, where the set-in sleeve starts
  cuffOuterX: 62, cuffOuterY: 370, // sleeves drop about 45° and end mid-bicep
  cuffInnerX: 136, cuffInnerY: 446,
  armpitX: 174, armpitY: 404,
  hemX: 172, hemY: 785,
  frontNeckY: 272, // lowest point of the front crew neck
  backNeckY: 234, // lowest point of the back neckline (higher than the front)
  ribWidth: 16,
} as const;

const CX = CANVAS_WIDTH / 2;
const r = (x: number) => 2 * CX - x;
/** Control point for a symmetric quadratic whose midpoint lands on `mid` between ends at `end`. */
const ctrl = (end: number, mid: number) => 2 * mid - end;

function bodyPath(topNeckY: number): string {
  const g = SHIRT_GEOMETRY;
  const left = [
    `L${g.shoulderX} ${g.shoulderY}`,
    `L${g.cuffOuterX} ${g.cuffOuterY}`,
    `Q${(g.cuffOuterX + g.cuffInnerX) / 2 + 4} ${(g.cuffOuterY + g.cuffInnerY) / 2 + 6} ${g.cuffInnerX} ${g.cuffInnerY}`,
    `Q${g.armpitX - 16} ${g.armpitY + 30} ${g.armpitX} ${g.armpitY}`,
    `C${g.armpitX - 4} ${g.armpitY + 140} ${g.hemX - 4} ${g.hemY - 160} ${g.hemX} ${g.hemY}`,
  ].join(" ");
  const right = [
    `C${r(g.hemX) + 4} ${g.hemY - 160} ${r(g.armpitX) + 4} ${g.armpitY + 140} ${r(g.armpitX)} ${g.armpitY}`,
    `Q${r(g.armpitX - 16)} ${g.armpitY + 30} ${r(g.cuffInnerX)} ${g.cuffInnerY}`,
    `Q${r((g.cuffOuterX + g.cuffInnerX) / 2 + 4)} ${(g.cuffOuterY + g.cuffInnerY) / 2 + 6} ${r(g.cuffOuterX)} ${g.cuffOuterY}`,
    `L${r(g.shoulderX)} ${g.shoulderY}`,
    `L${r(g.neckX)} ${g.neckY}`,
  ].join(" ");
  return `M${g.neckX} ${g.neckY} ${left} Q${CX} ${g.hemY + 12} ${r(g.hemX)} ${g.hemY} ${right} Q${CX} ${ctrl(g.neckY, topNeckY)} ${g.neckX} ${g.neckY} Z`;
}

/** Collar rib: the band between the neck opening and a curve one rib-width further out. */
function ribPath(neckMidY: number): string {
  const g = SHIRT_GEOMETRY;
  const outerY = g.neckY + 5;
  return `M${g.neckX} ${g.neckY} Q${CX} ${ctrl(g.neckY, neckMidY)} ${r(g.neckX)} ${g.neckY} L${r(g.neckX - 13)} ${outerY} Q${CX} ${ctrl(outerY, neckMidY + g.ribWidth)} ${g.neckX - 13} ${outerY} Z`;
}

function neckCurve(midY: number, inset = 0): string {
  const g = SHIRT_GEOMETRY;
  const y = g.neckY + inset * 0.4;
  return `M${g.neckX - inset} ${y} Q${CX} ${ctrl(y, midY + inset)} ${r(g.neckX - inset)} ${y}`;
}

/**
 * Flat T-shirt mockup in the canvas coordinate space (viewBox 0 0 800 1000). Every interpolated value is a
 * number or a regex-validated hex, so the string is safe for dangerouslySetInnerHTML and for an <img> Blob.
 */
export function shirtSvgMarkup(hex: string, side: DesignSide, opts: { guide?: boolean; background?: string | null } = {}): string {
  const g = SHIRT_GEOMETRY;
  const fill = safeHex(hex);
  const dark = isDarkHex(fill);
  const edge = shadeHex(fill, dark ? 26 : -34);
  const seam = shadeHex(fill, dark ? 18 : -22);
  const rib = shadeHex(fill, dark ? 10 : -10);
  const inside = shadeHex(fill, dark ? -14 : -46);
  const shadow = dark ? 0.5 : 0.16;
  const light = dark ? 0.07 : 0.3;
  const id = `tee-${side}`;
  const front = side === "front";
  const neckMid = front ? g.frontNeckY : g.backNeckY;

  const bg = opts.background ? `<rect width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}" fill="${safeHex(opts.background, "#f2f2f2")}"/>` : "";
  const body = bodyPath(front ? g.backNeckY - 6 : g.backNeckY);

  const defs =
    `<defs>` +
    `<linearGradient id="${id}-x" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#000" stop-opacity="${shadow * 0.9}"/><stop offset="0.22" stop-color="#000" stop-opacity="0"/><stop offset="0.5" stop-color="#fff" stop-opacity="${light * 0.35}"/><stop offset="0.78" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${shadow}"/></linearGradient>` +
    `<linearGradient id="${id}-y" x1="0" y1="0" x2="0" y2="1"><stop offset="0.1" stop-color="#fff" stop-opacity="${light * 0.35}"/><stop offset="0.45" stop-color="#fff" stop-opacity="0"/><stop offset="0.45" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="${shadow * 0.35}"/></linearGradient>` +
    `<filter id="${id}-soft" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="7"/></filter>` +
    `<clipPath id="${id}-clip"><path d="${body}"/></clipPath>` +
    `</defs>`;

  // Soft folds: shadows under the sleeves and near the hem, highlights along the top of the sleeves.
  const folds =
    `<g clip-path="url(#${id}-clip)" filter="url(#${id}-soft)" fill="none" stroke-linecap="round">` +
    `<path d="M${g.armpitX + 4} ${g.armpitY + 2} Q${g.armpitX + 34} ${g.armpitY + 50} ${g.armpitX + 26} ${g.armpitY + 230}" stroke="#000" stroke-opacity="${shadow * 0.4}" stroke-width="10"/>` +
    `<path d="M${r(g.armpitX + 4)} ${g.armpitY + 2} Q${r(g.armpitX + 34)} ${g.armpitY + 50} ${r(g.armpitX + 26)} ${g.armpitY + 230}" stroke="#000" stroke-opacity="${shadow * 0.4}" stroke-width="10"/>` +
    `<path d="M${g.shoulderX + 10} ${g.shoulderY + 20} Q${g.shoulderX - 20} ${g.shoulderY + 70} ${g.cuffOuterX + 40} ${g.cuffOuterY + 30}" stroke="#fff" stroke-opacity="${light * 0.6}" stroke-width="18"/>` +
    `<path d="M${r(g.shoulderX + 10)} ${g.shoulderY + 20} Q${r(g.shoulderX - 20)} ${g.shoulderY + 70} ${r(g.cuffOuterX + 40)} ${g.cuffOuterY + 30}" stroke="#fff" stroke-opacity="${light * 0.6}" stroke-width="18"/>` +
    `<path d="M${g.hemX + 80} ${g.hemY - 8} Q${g.hemX + 100} ${g.hemY - 90} ${g.hemX + 92} ${g.hemY - 170}" stroke="#000" stroke-opacity="${shadow * 0.28}" stroke-width="10"/>` +
    `<path d="M${r(g.hemX + 70)} ${g.hemY - 8} Q${r(g.hemX + 96)} ${g.hemY - 70} ${r(g.hemX + 84)} ${g.hemY - 130}" stroke="#000" stroke-opacity="${shadow * 0.24}" stroke-width="9"/>` +
    `</g>`;

  // Stitching: armhole seams, shoulder seams, sleeve and body hems.
  const stitchLen = 12;
  const cuffDx = g.cuffInnerX - g.cuffOuterX;
  const cuffDy = g.cuffInnerY - g.cuffOuterY;
  const cuffLen = Math.hypot(cuffDx, cuffDy);
  const inX = (-cuffDy / cuffLen) * -stitchLen; // perpendicular to the cuff, pointing back up the sleeve
  const inY = (cuffDx / cuffLen) * -stitchLen;
  const stitches =
    `<g fill="none" stroke="${seam}" stroke-width="2.5" stroke-linecap="round">` +
    `<path d="M${g.shoulderX} ${g.shoulderY} Q${g.shoulderX + 22} ${g.shoulderY + 80} ${g.armpitX} ${g.armpitY}"/>` +
    `<path d="M${r(g.shoulderX)} ${g.shoulderY} Q${r(g.shoulderX + 22)} ${g.shoulderY + 80} ${r(g.armpitX)} ${g.armpitY}"/>` +
    `<path d="M${g.neckX} ${g.neckY} L${g.shoulderX} ${g.shoulderY}" stroke-opacity="0.6"/>` +
    `<path d="M${r(g.neckX)} ${g.neckY} L${r(g.shoulderX)} ${g.shoulderY}" stroke-opacity="0.6"/>` +
    `<g stroke-dasharray="7 5" stroke-width="2">` +
    `<path d="M${(g.cuffOuterX + inX).toFixed(1)} ${(g.cuffOuterY + inY).toFixed(1)} L${(g.cuffInnerX + inX).toFixed(1)} ${(g.cuffInnerY + inY).toFixed(1)}"/>` +
    `<path d="M${r(g.cuffOuterX + inX).toFixed(1)} ${(g.cuffOuterY + inY).toFixed(1)} L${r(g.cuffInnerX + inX).toFixed(1)} ${(g.cuffInnerY + inY).toFixed(1)}"/>` +
    `<path d="M${g.hemX + 2} ${g.hemY - 16} Q${CX} ${g.hemY - 4} ${r(g.hemX + 2)} ${g.hemY - 16}"/>` +
    `</g></g>`;

  // Collar: on the front the inside of the back neck shows through the opening; the rib band is always drawn.
  const insideBack = front
    ? `<path d="M${g.neckX} ${g.neckY} Q${CX} ${ctrl(g.neckY, g.backNeckY - 6)} ${r(g.neckX)} ${g.neckY} Q${CX} ${ctrl(g.neckY, neckMid)} ${g.neckX} ${g.neckY} Z" fill="${inside}"/>` +
      `<path d="${neckCurve(g.backNeckY - 6)}" fill="none" stroke="${rib}" stroke-width="10"/>`
    : "";
  const collar =
    insideBack +
    `<path d="${ribPath(neckMid)}" fill="${rib}" stroke="${edge}" stroke-width="2" stroke-linejoin="round"/>` +
    `<path d="${neckCurve(neckMid, -1)}" fill="none" stroke="#000" stroke-opacity="${shadow * 0.8}" stroke-width="3"/>` +
    `<path d="${neckCurve(neckMid + g.ribWidth * 0.5, 7)}" fill="none" stroke="${seam}" stroke-opacity="0.7" stroke-width="1.5" stroke-dasharray="3 4"/>`;

  const guideColor = dark ? "#ffffff" : "#111111";
  const guide = opts.guide
    ? `<rect data-guide="print-area" x="${PRINT_AREA.left}" y="${PRINT_AREA.top}" width="${PRINT_AREA.width}" height="${PRINT_AREA.height}" fill="none" stroke="${guideColor}" stroke-opacity="0.5" stroke-width="2" stroke-dasharray="8 6"/>`
    : "";

  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${CANVAS_WIDTH} ${CANVAS_HEIGHT}" width="${CANVAS_WIDTH}" height="${CANVAS_HEIGHT}">` +
    bg +
    defs +
    `<path d="${body}" fill="${fill}"/>` +
    `<path d="${body}" fill="url(#${id}-x)"/>` +
    `<path d="${body}" fill="url(#${id}-y)"/>` +
    folds +
    stitches +
    collar +
    `<path d="${body}" fill="none" stroke="${edge}" stroke-width="4" stroke-linejoin="round"/>` +
    guide +
    `</svg>`
  );
}
