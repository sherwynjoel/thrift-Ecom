import { rupeesToPaise, paiseToRupees } from "@/lib/money";
import { SIZES } from "@/lib/sizes";
import { buildVariantRows, variantKey, type ColorSpec, type VariantRow } from "@/lib/variant-rows";
import type { ProductInput } from "@/lib/validation/admin";

export interface ProductFormState {
  name: string; slug: string; description: string; fit: "OVERSIZED" | "REGULAR" | "RELAXED"; fabric: string;
  priceText: string; compareAtText: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; isCustomizable: boolean;
  collectionIds: string[]; sizes: string[]; colors: ColorSpec[]; rows: VariantRow[];
}

export interface ProductLike {
  name: string; slug: string; description: string; fit: ProductFormState["fit"]; fabric: string;
  basePricePaise: number; compareAtPricePaise: number | null; status: ProductFormState["status"]; isCustomizable: boolean;
  collectionIds: string[];
  variants: { id: string; size: string; colorName: string; colorHex: string; pricePaise: number | null; stock: number }[];
}

export function emptyProductForm(): ProductFormState {
  return {
    name: "", slug: "", description: "", fit: "OVERSIZED", fabric: "100% Cotton", priceText: "", compareAtText: "",
    status: "DRAFT", isCustomizable: false, collectionIds: [], sizes: [], colors: [{ name: "Black", hex: "#111111" }], rows: [],
  };
}

export function productFormFromProduct(p: ProductLike): ProductFormState {
  const order = new Map<string, number>(SIZES.map((s, i) => [s, i]));
  const sizes = [...new Set(p.variants.map((v) => v.size))].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  const colorMap = new Map<string, ColorSpec>();
  for (const v of p.variants) if (!colorMap.has(v.colorName.toLowerCase())) colorMap.set(v.colorName.toLowerCase(), { name: v.colorName, hex: v.colorHex });
  const colors = [...colorMap.values()];
  const existing: VariantRow[] = p.variants.map((v) => ({ key: variantKey(v.size, v.colorName), id: v.id, size: v.size, colorName: v.colorName, colorHex: v.colorHex, pricePaise: v.pricePaise, stock: v.stock }));
  return {
    name: p.name, slug: p.slug, description: p.description, fit: p.fit, fabric: p.fabric,
    priceText: paiseToRupees(p.basePricePaise), compareAtText: paiseToRupees(p.compareAtPricePaise),
    status: p.status, isCustomizable: p.isCustomizable, collectionIds: [...p.collectionIds],
    sizes, colors: colors.length ? colors : [{ name: "Black", hex: "#111111" }], rows: buildVariantRows(sizes, colors, existing),
  };
}

export function toProductInput(s: ProductFormState): { input: ProductInput | null; errors: Record<string, string[]> } {
  const errors: Record<string, string[]> = {};
  const base = rupeesToPaise(s.priceText);
  if (base === null) errors.basePricePaise = ["Enter a price in rupees, e.g. 599 or 599.50"];
  let compareAt: number | null = null;
  if (s.compareAtText.trim()) {
    compareAt = rupeesToPaise(s.compareAtText);
    if (compareAt === null) errors.compareAtPricePaise = ["Enter a price in rupees, or leave it blank"];
  }
  if (Object.keys(errors).length) return { input: null, errors };
  return {
    errors,
    input: {
      name: s.name, slug: s.slug.trim(), description: s.description, fit: s.fit, fabric: s.fabric,
      basePricePaise: base!, compareAtPricePaise: compareAt, status: s.status, isCustomizable: s.isCustomizable,
      collectionIds: s.collectionIds,
      variants: s.rows.map((r) => ({
        ...(r.id ? { id: r.id } : {}),
        size: r.size as ProductInput["variants"][number]["size"],
        colorName: r.colorName,
        colorHex: r.colorHex,
        pricePaise: r.pricePaise,
        stock: r.stock,
      })),
    },
  };
}
