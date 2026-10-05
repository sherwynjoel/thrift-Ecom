import { randomUUID } from "node:crypto";
import type { Fit, Prisma } from "@prisma/client";
import { db } from "@/server/db";
import { getStorage } from "@/server/adapters/storage";
import { NotFoundError, ValidationError } from "@/server/errors";
import { storeImage, uploadKeyFromUrl, validateImage } from "@/server/uploads";
import { addItem, ownedBy, type CartRef, type CartView } from "@/server/services/cart";
import { getCustomFees } from "@/server/services/settings";
import { MAX_QTY_PER_LINE } from "@/lib/catalog-types";
import type { CustomFees } from "@/lib/custom-pricing";
import { pngDimensions } from "@/lib/png";
import { toSideJson, validateSideJson, type SideJson } from "@/lib/studio/canvas-json";
import {
  DESIGN_ASSET_PREFIX, DESIGN_SIDES, MAX_DESIGN_ASSET_BYTES, MAX_DESIGN_UPLOAD_BYTES, MAX_PREVIEW_BYTES, MAX_PRINT_BYTES,
  PREVIEW_HEIGHT, PREVIEW_WIDTH, PRINT_SIZES, type DesignSide,
} from "@/lib/studio/constants";
import type { VariantLike } from "@/lib/variant-matrix";

export type { DesignSide };

export interface DesignSideUpload { json: unknown; preview: Uint8Array; print: Uint8Array }
export interface CreateDesignInput {
  productId: string; variantId: string; quantity: number; rightsConfirmed: boolean;
  front: DesignSideUpload | null; back: DesignSideUpload | null;
}
export interface DesignView {
  id: string; productId: string; colorName: string; front: SideJson | null; back: SideJson | null;
  frontPreviewUrl: string | null; backPreviewUrl: string | null; createdAt: Date;
}
export interface StudioProductCard { slug: string; name: string; pricePaise: number; imageUrl: string | null; colors: { name: string; hex: string }[] }
export interface StudioProduct { id: string; slug: string; name: string; fit: Fit; fabric: string; basePricePaise: number; variants: VariantLike[]; fees: CustomFees }

export function designFileUrl(key: string | null): string | null {
  return key ? getStorage().getPublicUrl(key) : null;
}

export async function listStudioProducts(): Promise<StudioProductCard[]> {
  const rows = await db.product.findMany({
    where: { status: "ACTIVE", isCustomizable: true },
    orderBy: { createdAt: "asc" },
    include: {
      images: { orderBy: { sortOrder: "asc" }, take: 1 },
      variants: { orderBy: { sortOrder: "asc" }, select: { colorName: true, colorHex: true } },
    },
  });
  return rows.map((p) => {
    const colors = new Map<string, string>();
    for (const v of p.variants) if (!colors.has(v.colorName)) colors.set(v.colorName, v.colorHex);
    return { slug: p.slug, name: p.name, pricePaise: p.basePricePaise, imageUrl: p.images[0]?.url ?? null, colors: [...colors].map(([name, hex]) => ({ name, hex })) };
  });
}

export async function getStudioProduct(slug: string): Promise<StudioProduct> {
  const p = await db.product.findFirst({
    where: { slug, status: "ACTIVE", isCustomizable: true },
    include: { variants: { orderBy: { sortOrder: "asc" } } },
  });
  if (!p) throw new NotFoundError("Customizable product");
  return {
    id: p.id, slug: p.slug, name: p.name, fit: p.fit, fabric: p.fabric, basePricePaise: p.basePricePaise,
    variants: p.variants.map((v) => ({ id: v.id, size: v.size, colorName: v.colorName, colorHex: v.colorHex, stock: v.stock, pricePaise: v.pricePaise ?? p.basePricePaise })),
    fees: await getCustomFees(),
  };
}

function ownerData(ref: CartRef): { userId: string | null; cartToken: string | null } {
  return "userId" in ref ? { userId: ref.userId, cartToken: null } : { userId: null, cartToken: ref.guestToken };
}

/** Stores the file and records it for its owner; never used within 24 h, it is purged (see purge-designs). */
export async function uploadDesignAsset(ref: CartRef, file: File): Promise<{ key: string; url: string }> {
  const stored = await storeImage(file, DESIGN_ASSET_PREFIX, { maxBytes: MAX_DESIGN_ASSET_BYTES });
  try {
    await db.designAsset.create({ data: { key: stored.key, ...ownerData(ref) } });
  } catch (err) {
    await getStorage().delete(stored.key).catch((e) => console.error("[designs] asset cleanup failed", stored.key, e));
    throw err;
  }
  return stored;
}

function checkPng(bytes: Uint8Array, side: DesignSide, kind: "Preview" | "Print"): void {
  const field = `${side}${kind}`;
  const what = `${side} ${kind.toLowerCase()} file`;
  let ext: string;
  try {
    ext = validateImage(bytes, kind === "Preview" ? MAX_PREVIEW_BYTES : MAX_PRINT_BYTES).ext;
  } catch {
    throw new ValidationError({ [field]: [`The ${what} is not a valid image or is too large`] });
  }
  const dims = ext === "png" ? pngDimensions(bytes) : null;
  const ok =
    dims !== null &&
    (kind === "Preview"
      ? dims.width === PREVIEW_WIDTH && dims.height === PREVIEW_HEIGHT
      : PRINT_SIZES.some((s) => s.width === dims.width && s.height === dims.height));
  if (!ok) throw new ValidationError({ [field]: [`The ${what} has the wrong format or size`] });
}

const ASSET_GONE = "An image in this design is no longer available. Please upload it again.";

function assetKeyFromUrl(url: string): string {
  const key = uploadKeyFromUrl(url);
  if (!key || !key.startsWith(`${DESIGN_ASSET_PREFIX}/`)) throw new ValidationError({ design: ["Images must be uploaded through the studio"] });
  return key;
}

export async function createDesignAndAddToCart(ref: CartRef, input: CreateDesignInput): Promise<{ designId: string; cart: CartView }> {
  if (!input.rightsConfirmed) throw new ValidationError({ rightsConfirmed: ["Confirm that you own the rights to this artwork"] });
  if (!input.front && !input.back) throw new ValidationError({ design: ["Add something to the front or back first"] });
  if (!Number.isInteger(input.quantity) || input.quantity < 1 || input.quantity > MAX_QTY_PER_LINE) {
    throw new ValidationError({ quantity: [`Choose a quantity between 1 and ${MAX_QTY_PER_LINE}`] });
  }
  const variant = await db.productVariant.findFirst({
    where: { id: input.variantId, productId: input.productId, product: { status: "ACTIVE", isCustomizable: true } },
    select: { id: true, colorName: true },
  });
  if (!variant) throw new NotFoundError("Customizable product");

  const assetUrlPrefix = getStorage().getPublicUrl(`${DESIGN_ASSET_PREFIX}/`);
  const checked: { side: DesignSide; upload: DesignSideUpload; json: SideJson }[] = [];
  const assetKeys = new Set<string>();
  let totalBytes = 0;
  for (const side of DESIGN_SIDES) {
    const upload = input[side];
    if (!upload) continue;
    totalBytes += upload.preview.byteLength + upload.print.byteLength;
    const check = validateSideJson(upload.json, assetUrlPrefix);
    if (!check.ok) throw new ValidationError({ [`${side}Json`]: [check.error] });
    if (check.json.objects.length === 0) throw new ValidationError({ [`${side}Json`]: [`The ${side} is empty`] });
    for (const url of check.assetUrls) assetKeys.add(assetKeyFromUrl(url));
    checkPng(upload.preview, side, "Preview");
    checkPng(upload.print, side, "Print");
    checked.push({ side, upload, json: check.json });
  }
  if (totalBytes > MAX_DESIGN_UPLOAD_BYTES) throw new ValidationError({ design: ["This design is too large to upload. Try smaller images."] });
  const keys = [...assetKeys];
  if (keys.length && (await db.designAsset.count({ where: { key: { in: keys }, ...ownedBy(ref) } })) !== keys.length) {
    throw new ValidationError({ design: [ASSET_GONE] });
  }

  const storage = getStorage();
  const written: string[] = [];
  const put = async (bytes: Uint8Array, folder: "previews" | "print") => {
    const key = `designs/${folder}/${randomUUID()}.png`;
    await storage.put(key, bytes, "image/png");
    written.push(key);
    return key;
  };
  const data: Prisma.DesignUncheckedCreateInput = { ...ownerData(ref), productId: input.productId, colorName: variant.colorName, assetKeys: keys, rightsConfirmed: true };
  try {
    for (const { side, upload, json } of checked) {
      const previewKey = await put(upload.preview, "previews");
      const printKey = await put(upload.print, "print");
      const stored = json as unknown as Prisma.InputJsonObject;
      if (side === "front") Object.assign(data, { frontJson: stored, frontPreviewKey: previewKey, frontPrintKey: printKey });
      else Object.assign(data, { backJson: stored, backPreviewKey: previewKey, backPrintKey: printKey });
    }
    const design = await db.$transaction(async (tx) => {
      const created = await tx.design.create({ data, select: { id: true } });
      // Marking the assets as used keeps the purge off them; a row it deleted since the check above fails the design.
      if (keys.length) {
        const marked = await tx.designAsset.updateMany({ where: { key: { in: keys }, ...ownedBy(ref) }, data: { designId: created.id } });
        if (marked.count !== keys.length) throw new ValidationError({ design: [ASSET_GONE] });
      }
      return created;
    });
    try {
      return { designId: design.id, cart: await addItem(ref, variant.id, input.quantity, { designId: design.id }) };
    } catch (err) {
      await db.design.delete({ where: { id: design.id } }).catch((e) => console.error("[designs] rollback failed", design.id, e));
      throw err;
    }
  } catch (err) {
    await Promise.all(written.map((k) => storage.delete(k).catch((e) => console.error("[designs] file cleanup failed", k, e))));
    throw err;
  }
}

export async function getDesignForOwner(ref: CartRef, id: string): Promise<DesignView> {
  const d = await db.design.findFirst({ where: { id, ...ownedBy(ref) } });
  if (!d) throw new NotFoundError("Design");
  return {
    id: d.id, productId: d.productId, colorName: d.colorName, front: toSideJson(d.frontJson), back: toSideJson(d.backJson),
    frontPreviewUrl: designFileUrl(d.frontPreviewKey), backPreviewUrl: designFileUrl(d.backPreviewKey), createdAt: d.createdAt,
  };
}
