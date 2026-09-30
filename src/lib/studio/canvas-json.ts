import { isStudioFontId, MAX_OBJECTS_PER_SIDE, MAX_SIDE_JSON_CHARS, MAX_TEXT_CHARS, type StudioFontId } from "./constants";

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
  for (const o of json.objects) {
    const type = String(o.type ?? "").toLowerCase();
    if (IMAGE_TYPES.has(type)) {
      const src = o.src;
      if (typeof src !== "string" || !src.startsWith(assetUrlPrefix) || src.includes("..")) {
        return { ok: false, error: "Images must be uploaded through the studio" };
      }
      assetUrls.add(src);
    } else if (TEXT_TYPES.has(type)) {
      if (typeof o.text !== "string" || o.text.length > MAX_TEXT_CHARS) return { ok: false, error: `Keep each text under ${MAX_TEXT_CHARS} characters` };
    } else {
      return { ok: false, error: "Design contains an unsupported layer" };
    }
  }
  return { ok: true, json, assetUrls: [...assetUrls] };
}
