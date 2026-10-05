// tbox logo geometry, drawn on a 286 × 100 grid (22-unit strokes, x-height 30→100).
// Letters use the default nonzero fill (overlapping strokes merge; the b counter is wound the other way so it cuts out).
// The "o" is a square box in the brand lime; every other letter uses the ink colour.
export const LOGO_VIEWBOX = "0 0 286 100";
export const LOGO_ASPECT = 286 / 100;

/** t, b and x — rendered in the current text colour. */
export const LOGO_INK_PATH = [
  // t: crossbar + stem with a curved foot
  "M10 10H32V70A8 8 0 0 0 40 78H44V100H34A24 24 0 0 1 10 76Z",
  "M0 30H44V52H0Z",
  // b: stem + rounded bowl (counter wound the other way so it cuts out)
  "M52 0H74V100H52Z",
  "M76 30H98A24 24 0 0 1 122 54V76A24 24 0 0 1 98 100H76A24 24 0 0 1 52 76V54A24 24 0 0 1 76 30ZM74 52V78H98A2 2 0 0 0 100 76V54A2 2 0 0 0 98 52Z",
  // x: two crossing diagonals
  "M216 30H242L286 100H260Z",
  "M260 30H286L242 100H216Z",
].join("");

/** The box "o" — rendered in the brand lime. */
export const LOGO_BOX_PATH = "M134 30H204V100H134ZM156 52V78H182V52Z";

/** App-icon geometry on a 100 × 100 grid: a lime rounded square carrying a black lowercase t. */
export const ICON_VIEWBOX = "0 0 100 100";
export const ICON_T_PATH = "M28 32H72V50H28ZM40 14H60V64A6 6 0 0 0 66 70H72V88H62A22 22 0 0 1 40 66Z";

export const BRAND_INK = "#F5F5F0";
export const BRAND_LIME = "#D4FF3F";
export const BRAND_BLACK = "#0A0A0A";

/** Standalone SVG markup for the app icon (used by the favicon and home-screen icons). */
export function iconSvg(size: number): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${ICON_VIEWBOX}"><rect width="100" height="100" rx="22" fill="${BRAND_LIME}"/><path d="${ICON_T_PATH}" fill="${BRAND_BLACK}"/></svg>`;
}

/** Standalone SVG markup for the wordmark on a transparent background. */
export function wordmarkSvg(height: number, ink = BRAND_INK): string {
  const width = Math.round(height * LOGO_ASPECT);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${LOGO_VIEWBOX}"><path d="${LOGO_INK_PATH}" fill="${ink}"/><path d="${LOGO_BOX_PATH}" fill="${BRAND_LIME}" fill-rule="evenodd"/></svg>`;
}
