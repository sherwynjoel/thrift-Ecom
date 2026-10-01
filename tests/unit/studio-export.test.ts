import { afterEach, describe, expect, it, vi } from "vitest";
import { exportSide, submitDesign, uploadAsset } from "@/components/studio/export-design";
import type { FabricModule } from "@/components/studio/fabric-types";
import { withImageCors, withoutBlankText } from "@/lib/studio/canvas-json";

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

function mockFetch(status: number, body: unknown) {
  const fn = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));
  globalThis.fetch = fn as unknown as typeof fetch;
  return fn;
}

const png = () => new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" });
const text = { objects: [{ type: "Textbox", text: "HI", data: { kind: "text", fontId: "anton" } }] };

describe("submitDesign", () => {
  it("posts only the non-empty side, within the route's 12-entry form limit", async () => {
    const fetch = mockFetch(201, { data: { designId: "d1" } });
    const res = await submitDesign({
      productId: "p1", variantId: "v1", quantity: 1, front: text, back: { objects: [] },
      exports: { front: { preview: png(), print: png() }, back: null },
    });
    expect(res).toEqual({ designId: "d1" });
    const [url, init] = fetch.mock.calls[0];
    expect(url).toBe("/api/designs");
    const form = init.body as FormData;
    expect([...form.keys()].sort()).toEqual(["frontJson", "frontPreview", "frontPrint", "productId", "quantity", "rightsConfirmed", "variantId"].sort());
    expect(JSON.parse(form.get("frontJson") as string)).toEqual(text);
    expect((form.get("frontPrint") as File).type).toBe("image/png");
  });

  it("sends both sides when both have exports (10 entries, under the limit of 12)", async () => {
    const fetch = mockFetch(201, { data: { designId: "d2" } });
    const ex = { preview: png(), print: png() };
    await submitDesign({ productId: "p", variantId: "v", quantity: 1, front: text, back: text, exports: { front: ex, back: ex } });
    expect([...(fetch.mock.calls[0][1].body as FormData).keys()]).toHaveLength(10);
  });

  it("surfaces the first field error from the server", async () => {
    mockFetch(400, { error: { message: "Invalid input", details: { designId: ["This design was made for a different tee or color"] } } });
    await expect(
      submitDesign({ productId: "p", variantId: "v", quantity: 1, front: text, back: { objects: [] }, exports: { front: { preview: png(), print: png() }, back: null } }),
    ).rejects.toThrow("This design was made for a different tee or color");
  });
});

describe("uploadAsset", () => {
  it("returns the stored url", async () => {
    mockFetch(201, { data: { url: "/api/uploads/designs/assets/a.png" } });
    await expect(uploadAsset(new File([png()], "a.png", { type: "image/png" }))).resolves.toEqual({ url: "/api/uploads/designs/assets/a.png" });
  });

  it("falls back to the server message, then a generic one", async () => {
    mockFetch(413, { error: { message: "File too large" } });
    await expect(uploadAsset(new File([png()], "a.png"))).rejects.toThrow("File too large");
    globalThis.fetch = vi.fn(async () => new Response("<html>", { status: 502 })) as unknown as typeof fetch;
    await expect(uploadAsset(new File([png()], "a.png"))).rejects.toThrow("Something went wrong. Please try again.");
  });
});

/** Stand-in for Fabric's StaticCanvas: records what the print render would see, then fails like a device without canvas memory. */
function fakeFabric(fail: () => never) {
  const renders: { caching: unknown[]; clip: unknown; loaded: Record<string, unknown>[] }[] = [];
  class StaticCanvas {
    objects: Record<string, unknown>[] = [];
    loaded: Record<string, unknown>[] = [];
    clipPath: unknown = undefined;
    async loadFromJSON(json: { objects: Record<string, unknown>[] }) {
      this.loaded = json.objects;
      this.objects = json.objects.map((o) => ({ ...o, objectCaching: true })); // Fabric's default
    }
    getObjects() {
      return this.objects;
    }
    toCanvasElement(): never {
      renders.push({ caching: this.objects.map((o) => o.objectCaching), clip: this.clipPath, loaded: this.loaded });
      return fail();
    }
    async dispose() {}
  }
  class Rect {}
  return { fabric: { StaticCanvas, Rect } as unknown as FabricModule, renders };
}

const image = { type: "Image", src: "/api/uploads/designs/assets/a.png", data: { kind: "image" } };
const opts = { families: { anton: "A", bebas: "B", inter: "I", marker: "M" }, colorHex: "#ffffff", side: "front" as const };

describe("exportSide print render", () => {
  it("draws every object uncached (full resolution), unclipped, with CORS images", async () => {
    const { fabric, renders } = fakeFabric(() => {
      throw new Error("out of memory");
    });
    await expect(exportSide(fabric, { objects: [image] }, opts)).rejects.toThrow("This device could not prepare the print file");
    expect(renders).toHaveLength(2); // 3600 × 4800, then the 3072 × 4096 fallback
    for (const r of renders) {
      expect(r.caching).toEqual([false]);
      expect(r.clip).toBeUndefined();
      expect(r.loaded[0].crossOrigin).toBe("anonymous");
    }
  });

  it("reports a tainted canvas as an image problem, not a device limit", async () => {
    const { fabric } = fakeFabric(() => {
      throw Object.assign(new Error("tainted"), { name: "SecurityError" });
    });
    await expect(exportSide(fabric, { objects: [image] }, opts)).rejects.toThrow("One of your images could not be prepared for print");
  });

  it("returns null for an empty side", async () => {
    const { fabric } = fakeFabric(() => {
      throw new Error("unused");
    });
    await expect(exportSide(fabric, { objects: [] }, opts)).resolves.toBeNull();
  });
});

describe("side JSON helpers", () => {
  it("drops blank text layers only", () => {
    const json = { objects: [{ type: "Textbox", text: "  " }, { type: "Textbox", text: "HI" }, image] };
    expect(withoutBlankText(json).objects).toEqual([{ type: "Textbox", text: "HI" }, image]);
  });

  it("adds crossOrigin to images only", () => {
    const out = withImageCors({ objects: [image, { type: "Textbox", text: "HI" }] }).objects;
    expect(out[0].crossOrigin).toBe("anonymous");
    expect(out[1]).not.toHaveProperty("crossOrigin");
  });
});
