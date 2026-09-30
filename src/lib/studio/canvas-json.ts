import { CANVAS_HEIGHT, CANVAS_WIDTH, isStudioFontId, MAX_OBJECTS_PER_SIDE, MAX_SIDE_JSON_CHARS, MAX_TEXT_CHARS, type StudioFontId } from "./constants";

/** The only shape the studio stores per side: Fabric's `toObject(["data"])` minus canvas-level keys. */
export interface SideJson { version?: string; objects: Record<string, unknown>[] }

export const EMPTY_SIDE: SideJson = { objects: [] };

const TEXT_TYPES = new Set(["textbox", "i-text", "itext", "text"]);
const IMAGE_TYPES = new Set(["image"]);
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

export function toSideJson(raw: unknown): SideJson | null {
  if (!isRecord(raw) || !Array.isArray(raw.objects) || !raw.objects.every(isRecord)) return null;
  return { ...(typeof raw.version === "string" ? { version: raw.version } : {}), objects: raw.objects as Record<string, unknown>[] };
}

export function fontIdOf(o: Record<string, unknown>): StudioFontId | null {
  const d = o.data;
  return isRecord(d) && isStudioFontId(d.fontId) ? d.fontId : null;
}

export function fontIdsIn(json: SideJson): StudioFontId[] {
  return [...new Set(json.objects.map(fontIdOf).filter((f): f is StudioFontId => f !== null))];
}

/** next/font family names are build-specific, so text stores a stable fontId and gets its family set on every load. */
export function withFontFamilies(json: SideJson, families: Record<StudioFontId, string>): SideJson {
  return { ...json, objects: json.objects.map((o) => { const id = fontIdOf(o); return id ? { ...o, fontFamily: families[id] } : o; }) };
}

export type SideJsonCheck = { ok: true; json: SideJson; assetUrls: string[] } | { ok: false; error: string };

const HEX6 = /^#[0-9a-f]{6}$/i;
const ORIGIN_X = new Set(["left", "center", "right"]);
const ORIGIN_Y = new Set(["top", "center", "bottom"]);
const TEXT_ALIGN = new Set(["left", "center", "right", "justify"]);
const FONT_WEIGHT = new Set(["normal", "bold"]);
const FONT_STYLE = new Set(["normal", "italic", "oblique"]);

function finiteNumber(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

/**
 * Geometry/transform keys every accepted object (text or image) may carry, clamped to sane ranges.
 * Anything not written here — clipPath, pattern/gradient fill or stroke, shadow, filters, and any
 * other property — is dropped by construction: callers build `out` fresh and never spread `o`.
 */
function sanitizeGeometry(o: Record<string, unknown>, out: Record<string, unknown>): void {
  out.left = clamp(finiteNumber(o.left) ?? 0, -5 * CANVAS_WIDTH, 5 * CANVAS_WIDTH);
  out.top = clamp(finiteNumber(o.top) ?? 0, -5 * CANVAS_HEIGHT, 5 * CANVAS_HEIGHT);
  const width = finiteNumber(o.width);
  if (width !== null) out.width = Math.max(0, width);
  const height = finiteNumber(o.height);
  if (height !== null) out.height = Math.max(0, height);
  out.scaleX = clamp(finiteNumber(o.scaleX) ?? 1, 0.01, 50);
  out.scaleY = clamp(finiteNumber(o.scaleY) ?? 1, 0.01, 50);
  out.angle = clamp(finiteNumber(o.angle) ?? 0, -360, 360);
  if (typeof o.flipX === "boolean") out.flipX = o.flipX;
  if (typeof o.flipY === "boolean") out.flipY = o.flipY;
  out.opacity = clamp(finiteNumber(o.opacity) ?? 1, 0, 1);
  out.originX = typeof o.originX === "string" && ORIGIN_X.has(o.originX) ? o.originX : "left";
  out.originY = typeof o.originY === "string" && ORIGIN_Y.has(o.originY) ? o.originY : "top";
}

/** Text objects keep only the studio's stable fontId (never the build-specific fontFamily) plus a few styling enums. */
function sanitizeText(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { type: String(o.type), text: o.text };
  sanitizeGeometry(o, out);
  const fontId = isRecord(o.data) && isStudioFontId(o.data.fontId) ? o.data.fontId : null;
  if (fontId) out.data = { fontId };
  if (typeof o.fill === "string" && HEX6.test(o.fill)) out.fill = o.fill.toLowerCase();
  const fontSize = finiteNumber(o.fontSize);
  if (fontSize !== null) out.fontSize = clamp(fontSize, 8, 400);
  const charSpacing = finiteNumber(o.charSpacing);
  if (charSpacing !== null) out.charSpacing = clamp(charSpacing, -1000, 1000);
  if (typeof o.textAlign === "string" && TEXT_ALIGN.has(o.textAlign)) out.textAlign = o.textAlign;
  if (typeof o.fontWeight === "string" && FONT_WEIGHT.has(o.fontWeight)) out.fontWeight = o.fontWeight;
  if (typeof o.fontStyle === "string" && FONT_STYLE.has(o.fontStyle)) out.fontStyle = o.fontStyle;
  return out;
}

/** True once `src` is percent-decoded and still escapes with `..` — decoding first catches `%2e%2e` and similar. */
function escapesWithDotDot(src: string): boolean {
  try {
    return decodeURIComponent(src).includes("..");
  } catch {
    return true; // malformed percent-encoding is treated as an escape attempt
  }
}

/** Image objects keep only a same-origin, studio-uploaded `src` (verbatim, so it still matches the asset key) plus geometry. */
function sanitizeImage(o: Record<string, unknown>, assetUrlPrefix: string): Record<string, unknown> | null {
  const src = o.src;
  if (typeof src !== "string" || !src.startsWith(assetUrlPrefix) || escapesWithDotDot(src)) return null;
  const out: Record<string, unknown> = { type: String(o.type), src };
  sanitizeGeometry(o, out);
  return out;
}

export function validateSideJson(raw: unknown, assetUrlPrefix: string): SideJsonCheck {
  const malformed = { ok: false as const, error: "Design data is malformed" };
  if (!isRecord(raw)) return malformed;
  if ((raw.backgroundImage ?? null) !== null || (raw.overlayImage ?? null) !== null) return malformed;
  let size: number;
  try {
    size = JSON.stringify(raw).length;
  } catch {
    return malformed;
  }
  if (size > MAX_SIDE_JSON_CHARS) return { ok: false, error: "This design is too complex. Remove some layers." };
  const json = toSideJson(raw);
  if (!json) return malformed;
  if (json.objects.length > MAX_OBJECTS_PER_SIDE) return { ok: false, error: `Use at most ${MAX_OBJECTS_PER_SIDE} layers per side` };
  const assetUrls = new Set<string>();
  const objects: Record<string, unknown>[] = [];
  for (const o of json.objects) {
    const type = String(o.type ?? "").toLowerCase();
    if (IMAGE_TYPES.has(type)) {
      const sanitized = sanitizeImage(o, assetUrlPrefix);
      if (!sanitized) return { ok: false, error: "Images must be uploaded through the studio" };
      assetUrls.add(sanitized.src as string);
      objects.push(sanitized);
    } else if (TEXT_TYPES.has(type)) {
      if (typeof o.text !== "string" || o.text.length > MAX_TEXT_CHARS) return { ok: false, error: `Keep each text under ${MAX_TEXT_CHARS} characters` };
      objects.push(sanitizeText(o));
    } else {
      return { ok: false, error: "Design contains an unsupported layer" };
    }
  }
  return { ok: true, json: { ...json, objects }, assetUrls: [...assetUrls] };
}
