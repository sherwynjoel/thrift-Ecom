// Client-safe constants shared by the studio (browser) and the designs service (server).
export const CANVAS_WIDTH = 800;
export const CANVAS_HEIGHT = 1000;
/** Print area in canvas units: 240 × 320 units = 12 × 16 in at 20 units per inch. Same position on front and back. */
export const PRINT_AREA = { left: 280, top: 250, width: 240, height: 320 } as const;
export const PRINT_AREA_INCHES = { width: 12, height: 16 } as const;
export const UNITS_PER_INCH = PRINT_AREA.width / PRINT_AREA_INCHES.width;
/** 3600 × 4800 = 300 DPI. 3072 × 4096 (256 DPI) is the fallback for browsers that cannot allocate a 17-megapixel canvas (iOS Safari). */
export const PRINT_SIZES = [{ width: 3600, height: 4800 }, { width: 3072, height: 4096 }] as const;
export const PREVIEW_WIDTH = 800;
export const PREVIEW_HEIGHT = 1000;
export const HISTORY_LIMIT = 20;
export const MAX_OBJECTS_PER_SIDE = 30;
export const MAX_SIDE_JSON_CHARS = 200_000;
export const MAX_TEXT_CHARS = 200;
const MB = 1024 * 1024;
export const MAX_DESIGN_ASSET_BYTES = 10 * MB;
export const MAX_PREVIEW_BYTES = 3 * MB;
export const MAX_PRINT_BYTES = 25 * MB;
export const MAX_DESIGN_UPLOAD_BYTES = 30 * MB;
export const DESIGN_ASSET_PREFIX = "designs/assets";
export const DPI_WARN = 150;
export const DPI_BLURRY = 100;

export type DesignSide = "front" | "back";
export const DESIGN_SIDES: readonly DesignSide[] = ["front", "back"];

export type StudioFontId = "anton" | "bebas" | "inter" | "marker";
export const STUDIO_FONTS: readonly { id: StudioFontId; label: string }[] = [
  { id: "anton", label: "Anton" },
  { id: "bebas", label: "Bebas Neue" },
  { id: "inter", label: "Inter" },
  { id: "marker", label: "Permanent Marker" },
];

export function isStudioFontId(v: unknown): v is StudioFontId {
  return typeof v === "string" && STUDIO_FONTS.some((f) => f.id === v);
}
