// tebox logo geometry, drawn on a 364 × 100 grid (22-unit strokes, x-height 30→100).
// Letters use the default nonzero fill (overlapping strokes merge; the e and b counters are wound the other way so they cut out).
// The "o" is a square box in the brand lime; every other letter uses the ink colour.
export const LOGO_VIEWBOX = "0 0 364 100";
export const LOGO_ASPECT = 364 / 100;

/** Each ink letter on its own, so the splash screen can animate them one by one. */
export const LOGO_LETTER_PATHS = {
  // t: stem with a curved foot + crossbar
  t: "M10 10H32V70A8 8 0 0 0 40 78H44V100H34A24 24 0 0 1 10 76ZM0 30H44V52H0Z",
  // e: the b's rounded bowl with a crossbar and an open lower right; the eye is wound the other way so it cuts out
  e: "M76 30H98A24 24 0 0 1 122 54V72H74V82H104V100H76A24 24 0 0 1 52 76V54A24 24 0 0 1 76 30ZM74 52V62H100V52Z",
  // b: stem + rounded bowl (counter wound the other way so it cuts out)
  b: "M130 0H152V100H130ZM154 30H176A24 24 0 0 1 200 54V76A24 24 0 0 1 176 100H154A24 24 0 0 1 130 76V54A24 24 0 0 1 154 30ZM152 52V78H176A2 2 0 0 0 178 76V54A2 2 0 0 0 176 52Z",
  // x: two crossing diagonals
  x: "M294 30H320L364 100H338ZM338 30H364L320 100H294Z",
} as const;

/** t, e, b and x — rendered in the current text colour. */
export const LOGO_INK_PATH = LOGO_LETTER_PATHS.t + LOGO_LETTER_PATHS.e + LOGO_LETTER_PATHS.b + LOGO_LETTER_PATHS.x;

/** The box "o" — rendered in the brand lime. */
export const LOGO_BOX_PATH = "M212 30H282V100H212ZM234 52V78H260V52Z";

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
