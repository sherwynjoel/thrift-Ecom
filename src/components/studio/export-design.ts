import { CANVAS_HEIGHT, CANVAS_WIDTH, PREVIEW_HEIGHT, PREVIEW_WIDTH, PRINT_AREA, PRINT_SIZES, type DesignSide, type StudioFontId } from "@/lib/studio/constants";
import { fontIdsIn, withFontFamilies, withImageCors, type SideJson } from "@/lib/studio/canvas-json";
import { shirtSvgMarkup } from "@/lib/studio/shirt";
import { loadFontFaces, type FabricModule } from "./fabric-types";

export interface SideExport { preview: Blob; print: Blob }

const GENERIC_ERROR = "Something went wrong. Please try again.";

const toBlob = (el: HTMLCanvasElement) => new Promise<Blob | null>((resolve) => el.toBlob(resolve, "image/png"));

async function readError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { error?: { message?: string; details?: Record<string, string[]> } };
    const first = body.error?.details && Object.values(body.error.details)[0]?.[0];
    return first ?? body.error?.message ?? GENERIC_ERROR;
  } catch {
    return GENERIC_ERROR;
  }
}

export async function uploadAsset(file: File): Promise<{ url: string }> {
  const body = new FormData();
  body.set("file", file);
  const res = await fetch("/api/designs/assets", { method: "POST", body });
  if (!res.ok) throw new Error(await readError(res));
  return ((await res.json()) as { data: { url: string } }).data;
}

/**
 * Renders one side off-screen: a transparent print PNG of just the print area (3600 × 4800, or 3072 × 4096 when the
 * device cannot allocate that) and an 800 × 1000 preview of the shirt with the design on it. Null for an empty side.
 */
export async function exportSide(fabric: FabricModule, json: SideJson, opts: { families: Record<StudioFontId, string>; colorHex: string; side: DesignSide }): Promise<SideExport | null> {
  if (json.objects.length === 0) return null;
  await loadFontFaces(fontIdsIn(json), opts.families);
  const sc = new fabric.StaticCanvas(undefined, { width: CANVAS_WIDTH, height: CANVAS_HEIGHT, enableRetinaScaling: false });
  try {
    await sc.loadFromJSON(withImageCors(withFontFamilies(json, opts.families)));
    // Fabric's per-object cache is capped at ~2 MP, which would turn a 3600 × 4800 print into an upscale of that cache:
    // draw every object straight onto the export canvas at full resolution instead.
    sc.getObjects().forEach((o) => {
      o.objectCaching = false;
    });
    // No clipPath for the print render: the crop below already equals the print area (and the clip rect has its own capped cache).
    let print: Blob | null = null;
    for (const size of PRINT_SIZES) {
      try {
        const el = sc.toCanvasElement(size.width / PRINT_AREA.width, { ...PRINT_AREA });
        print = await toBlob(el);
        el.width = 0;
        el.height = 0; // release the large bitmap immediately (matters on phones)
        if (print && print.size > 0) break;
      } catch (err) {
        // A tainted canvas (an image served without CORS) fails at every size: say so instead of blaming the device.
        if ((err as { name?: string } | null)?.name === "SecurityError") throw new Error("One of your images could not be prepared for print. Remove it and upload it again.");
        console.warn("[studio] print export failed at", size, err);
      }
      print = null;
    }
    if (!print) throw new Error("This device could not prepare the print file. Please try a desktop browser.");
    sc.clipPath = new fabric.Rect({ ...PRINT_AREA, absolutePositioned: true }); // the preview shows the shirt, so clip the art to the area
    const out = document.createElement("canvas");
    out.width = PREVIEW_WIDTH;
    out.height = PREVIEW_HEIGHT;
    const ctx = out.getContext("2d");
    if (!ctx) throw new Error("This browser cannot draw previews.");
    const svgUrl = URL.createObjectURL(new Blob([shirtSvgMarkup(opts.colorHex, opts.side, { background: "#f2f2f2" })], { type: "image/svg+xml" }));
    try {
      const shirt = new Image();
      shirt.src = svgUrl;
      await shirt.decode();
      ctx.drawImage(shirt, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    } finally {
      URL.revokeObjectURL(svgUrl);
    }
    const art = sc.toCanvasElement(PREVIEW_WIDTH / CANVAS_WIDTH);
    ctx.drawImage(art, 0, 0, PREVIEW_WIDTH, PREVIEW_HEIGHT);
    art.width = 0;
    art.height = 0;
    const preview = await toBlob(out);
    if (!preview) throw new Error("Could not prepare the preview.");
    return { preview, print };
  } finally {
    void sc.dispose();
  }
}

export async function submitDesign(args: { productId: string; variantId: string; quantity: number; front: SideJson; back: SideJson; exports: Record<DesignSide, SideExport | null> }): Promise<{ designId: string }> {
  const body = new FormData();
  body.set("productId", args.productId);
  body.set("variantId", args.variantId);
  body.set("quantity", String(args.quantity));
  body.set("rightsConfirmed", "true");
  for (const side of ["front", "back"] as const) {
    const ex = args.exports[side];
    if (!ex) continue;
    body.set(`${side}Json`, JSON.stringify(args[side]));
    body.set(`${side}Preview`, new File([ex.preview], `${side}-preview.png`, { type: "image/png" }));
    body.set(`${side}Print`, new File([ex.print], `${side}-print.png`, { type: "image/png" }));
  }
  const res = await fetch("/api/designs", { method: "POST", body });
  if (!res.ok) throw new Error(await readError(res));
  return ((await res.json()) as { data: { designId: string } }).data;
}
