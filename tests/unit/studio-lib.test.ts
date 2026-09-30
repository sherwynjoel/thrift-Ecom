import { describe, expect, it } from "vitest";
import { dpiLevel, dpiMessage, effectiveDpi, objectDpi } from "@/lib/studio/dpi";
import { canRedo, canUndo, createHistory, pushHistory, redoHistory, undoHistory } from "@/lib/studio/history";
import { fontIdsIn, toSideJson, validateSideJson, withFontFamilies } from "@/lib/studio/canvas-json";
import { isDarkHex, safeHex, shadeHex, shirtSvgMarkup } from "@/lib/studio/shirt";
import { clampScale, pinchTransform } from "@/lib/studio/gesture";
import { HISTORY_LIMIT, isStudioFontId, MAX_OBJECTS_PER_SIDE, PRINT_AREA, PRINT_SIZES, UNITS_PER_INCH } from "@/lib/studio/constants";

describe("constants", () => {
  it("keep the print area at 12 × 16 in and both print sizes at 3:4", () => {
    expect(PRINT_AREA.width / UNITS_PER_INCH).toBe(12);
    expect(PRINT_AREA.height / UNITS_PER_INCH).toBe(16);
    for (const s of PRINT_SIZES) expect(s.width / s.height).toBeCloseTo(PRINT_AREA.width / PRINT_AREA.height);
    expect(PRINT_SIZES[0].width / 12).toBe(300);
    expect(isStudioFontId("anton")).toBe(true);
    expect(isStudioFontId("comic")).toBe(false);
  });
});

describe("DPI", () => {
  it("uses the smaller of the two axes", () => {
    expect(effectiveDpi({ pixelWidth: 3600, pixelHeight: 3000, printedWidthIn: 12, printedHeightIn: 12 })).toBe(250);
    expect(effectiveDpi({ pixelWidth: 100, pixelHeight: 100, printedWidthIn: 0, printedHeightIn: 1 })).toBe(Infinity);
  });

  it("converts canvas units to printed inches", () => {
    // 1200 × 1600 px filling the whole 240 × 320 unit print area = 12 × 16 in → 100 DPI
    expect(objectDpi({ naturalWidth: 1200, naturalHeight: 1600, scaledWidth: 240, scaledHeight: 320 })).toBe(100);
    // same image at half size (6 × 8 in) → 200 DPI
    expect(objectDpi({ naturalWidth: 1200, naturalHeight: 1600, scaledWidth: 120, scaledHeight: 160 })).toBe(200);
  });

  it("grades the result without ever blocking", () => {
    expect(dpiLevel(300)).toBe("ok");
    expect(dpiLevel(150)).toBe("ok");
    expect(dpiLevel(149)).toBe("low");
    expect(dpiLevel(100)).toBe("low");
    expect(dpiLevel(99)).toBe("blurry");
    expect(dpiMessage("ok")).toBeNull();
    expect(dpiMessage("low")).toBe("Low resolution: may look soft");
    expect(dpiMessage("blurry")).toBe("May print blurry");
  });
});

describe("history", () => {
  it("undoes and redoes, and a new change clears redo", () => {
    let h = createHistory("a");
    h = pushHistory(h, "b");
    h = pushHistory(h, "c");
    h = undoHistory(h);
    expect(h.present).toBe("b");
    expect(canRedo(h)).toBe(true);
    h = redoHistory(h);
    expect(h.present).toBe("c");
    h = undoHistory(h);
    h = pushHistory(h, "d");
    expect(canRedo(h)).toBe(false);
    expect(h.past).toEqual(["a", "b"]);
  });

  it("ignores unchanged snapshots and keeps at most the limit", () => {
    let h = createHistory("0");
    expect(pushHistory(h, "0")).toBe(h);
    for (let i = 1; i <= 30; i++) h = pushHistory(h, String(i));
    expect(h.past).toHaveLength(HISTORY_LIMIT);
    expect(h.past[0]).toBe("10");
    for (let i = 0; i < 25; i++) h = undoHistory(h);
    expect(h.present).toBe("10");
    expect(canUndo(h)).toBe(false);
  });
});

describe("canvas JSON", () => {
  const prefix = "/api/uploads/designs/assets/";
  const text = { type: "Textbox", text: "HELLO", fontFamily: "__Anton_x", data: { kind: "text", fontId: "anton" } };
  const image = { type: "Image", src: `${prefix}a.png`, data: { kind: "image" } };

  it("normalises raw JSON", () => {
    expect(toSideJson({ version: "6.4.0", objects: [text], background: "#fff" })).toEqual({ version: "6.4.0", objects: [text] });
    expect(toSideJson({ objects: "nope" })).toBeNull();
    expect(toSideJson(null)).toBeNull();
    expect(toSideJson([1])).toBeNull();
  });

  it("remaps font families from the stable font id", () => {
    const json = { objects: [text, image] };
    expect(fontIdsIn(json)).toEqual(["anton"]);
    const out = withFontFamilies(json, { anton: "Anton-X", bebas: "B", inter: "I", marker: "M" });
    expect(out.objects[0].fontFamily).toBe("Anton-X");
    expect(out.objects[1]).toBe(image);
  });

  it("accepts text and studio images, rebuilds them from a property whitelist and collects asset urls", () => {
    const r = validateSideJson({ version: "6.4.0", objects: [text, image, image] }, prefix);
    if (!r.ok) throw new Error("expected ok");
    expect(r.json.version).toBe("6.4.0");
    expect(r.json.objects).toHaveLength(3);
    expect(r.json.objects[0]).toMatchObject({ type: "Textbox", text: "HELLO", data: { fontId: "anton" } });
    expect(r.json.objects[0].fontFamily).toBeUndefined(); // dropped: re-derived from fontId on load, never trusted from storage
    expect(r.json.objects[1]).toMatchObject({ type: "Image", src: `${prefix}a.png` });
    expect(r.json.objects[1].data).toBeUndefined(); // images carry no whitelisted data
    expect(r.assetUrls).toEqual([`${prefix}a.png`]);
  });

  it("strips pattern fill, clipPath, shadow, filters and stroke instead of storing them", () => {
    const r = validateSideJson({
      objects: [{
        type: "textbox", text: "ok",
        fill: { type: "pattern", source: "https://evil.example/x.png" },
        clipPath: { type: "image", src: "https://evil.example/y.png" },
        shadow: { color: "red" },
        filters: [{ type: "Blur" }],
        stroke: "#ff0000",
        data: { kind: "text" },
      }],
    }, prefix);
    if (!r.ok) throw new Error("expected ok");
    const [o] = r.json.objects;
    expect(o.text).toBe("ok");
    expect(o.fill).toBeUndefined();
    expect(o.clipPath).toBeUndefined();
    expect(o.shadow).toBeUndefined();
    expect(o.filters).toBeUndefined();
    expect(o.stroke).toBeUndefined();
  });

  it("rejects an image whose src escapes via a percent-encoded '..' segment", () => {
    expect(validateSideJson({ objects: [{ type: "Image", src: `${prefix}%2e%2e/x.png` }] }, prefix)).toEqual({ ok: false, error: "Images must be uploaded through the studio" });
  });

  it("clamps non-finite and out-of-range numerics instead of rejecting the object", () => {
    const r = validateSideJson({
      objects: [{
        type: "Image", src: `${prefix}a.png`,
        clipPath: { type: "image", src: "https://evil.example/z.png" },
        scaleX: 1e12, scaleY: Number.NaN, angle: Number.POSITIVE_INFINITY, left: Number.NaN, opacity: 5,
      }],
    }, prefix);
    if (!r.ok) throw new Error("expected ok");
    const [o] = r.json.objects;
    expect(o.clipPath).toBeUndefined();
    expect(o.scaleX).toBe(50);
    expect(o.scaleY).toBe(1);
    expect(o.angle).toBe(0);
    expect(o.left).toBe(0);
    expect(o.opacity).toBe(1);
  });

  it("rejects foreign images, unknown layers, oversize text and too many layers", () => {
    expect(validateSideJson({ objects: [{ type: "Image", src: "https://evil.example/x.png" }] }, prefix)).toMatchObject({ ok: false });
    expect(validateSideJson({ objects: [{ type: "Image", src: `${prefix}../x.png` }] }, prefix)).toMatchObject({ ok: false });
    expect(validateSideJson({ objects: [{ type: "Rect" }] }, prefix)).toEqual({ ok: false, error: "Design contains an unsupported layer" });
    expect(validateSideJson({ objects: [{ ...text, text: "x".repeat(201) }] }, prefix)).toMatchObject({ ok: false });
    expect(validateSideJson({ objects: Array.from({ length: MAX_OBJECTS_PER_SIDE + 1 }, () => text) }, prefix)).toMatchObject({ ok: false });
    expect(validateSideJson({ objects: [text], backgroundImage: { type: "Image" } }, prefix)).toMatchObject({ ok: false });
    expect(validateSideJson("x", prefix)).toEqual({ ok: false, error: "Design data is malformed" });
  });
});

describe("shirt mockup", () => {
  it("fills the shirt with a validated color", () => {
    const svg = shirtSvgMarkup("#1A2B3C", "front");
    expect(svg).toContain('fill="#1a2b3c"');
    expect(shirtSvgMarkup('"><script>', "front")).not.toContain("<script>");
    expect(safeHex("#abc")).toBe("#f5f5f5");
    expect(safeHex(null, "#000000")).toBe("#000000");
  });

  it("draws the dashed print guide only when asked and differs front to back", () => {
    expect(shirtSvgMarkup("#ffffff", "front", { guide: true })).toContain('data-guide="print-area"');
    expect(shirtSvgMarkup("#ffffff", "front")).not.toContain("data-guide");
    expect(shirtSvgMarkup("#ffffff", "front")).not.toBe(shirtSvgMarkup("#ffffff", "back"));
    expect(shirtSvgMarkup("#ffffff", "back", { background: "#f2f2f2" })).toContain('fill="#f2f2f2"');
  });

  it("shades and classifies colors", () => {
    expect(shadeHex("#101010", -32)).toBe("#000000");
    expect(shadeHex("#f0f0f0", 32)).toBe("#ffffff");
    expect(isDarkHex("#111111")).toBe(true);
    expect(isDarkHex("#f5f5dc")).toBe(false);
  });
});

describe("pinch gesture", () => {
  it("returns the scale and rotation between two finger positions", () => {
    const r = pinchTransform({ x: 0, y: 0 }, { x: 100, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 200 });
    expect(r.scale).toBeCloseTo(2);
    expect(r.rotateDeg).toBeCloseTo(90);
    expect(pinchTransform({ x: 1, y: 1 }, { x: 1, y: 1 }, { x: 0, y: 0 }, { x: 5, y: 5 }).scale).toBe(1);
    expect(clampScale(100)).toBe(20);
    expect(clampScale(0.001)).toBe(0.05);
  });
});
