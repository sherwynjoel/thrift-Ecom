import type { StudioFontId } from "@/lib/studio/constants";

export type FabricModule = typeof import("fabric");
export interface StudioObjectData { kind: "text" | "image"; fontId?: StudioFontId }

let pending: Promise<FabricModule> | null = null;
/** The only place Fabric is imported. Browser only (callers run inside effects or event handlers). */
export function loadFabric(): Promise<FabricModule> {
  pending ??= import("fabric").catch((err: unknown) => {
    pending = null; // let a later call retry (e.g. a flaky network on a phone)
    throw err;
  });
  return pending;
}

declare module "fabric" {
  interface FabricObject { data?: StudioObjectData }
}
