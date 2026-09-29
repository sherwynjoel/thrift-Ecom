import { rupeesToPaise, paiseToRupees } from "@/lib/money";
import { SIZES } from "@/lib/sizes";
import { buildVariantRows, variantKey, type ColorSpec, type VariantRow } from "@/lib/variant-rows";
import type { ProductInput } from "@/lib/validation/admin";

export interface ProductFormState {
  name: string; slug: string; description: string; fit: "OVERSIZED" | "REGULAR" | "RELAXED"; fabric: string;
  priceText: string; compareAtText: string; status: "DRAFT" | "ACTIVE" | "ARCHIVED"; isCustomizable: boolean;
  collectionIds: string[]; sizes: string[]; colors: ColorSpec[]; rows: VariantRow[];
  /** Raw text the admin typed into each row's price-override input, keyed by row key. Lets the input stay
   * controlled (no reliance on onBlur) and lets `toProductInput` reject unparseable text instead of the
   * matrix silently dropping it to `pricePaise: null`. */
  priceTexts: Record<string, string>;
  /** The variant rows as loaded from the server, before any size/color edits this session. Used to recover
   * a row's id, stock, and price override if a size or color is removed and then re-added. */
  originalRows: VariantRow[];
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
    priceTexts: {}, originalRows: [],
  };
}

export function productFormFromProduct(p: ProductLike): ProductFormState {
  const order = new Map<string, number>(SIZES.map((s, i) => [s, i]));
  const sizes = [...new Set(p.variants.map((v) => v.size))].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  const colorMap = new Map<string, ColorSpec>();
  for (const v of p.variants) if (!colorMap.has(v.colorName.toLowerCase())) colorMap.set(v.colorName.toLowerCase(), { name: v.colorName, hex: v.colorHex });
  const colors = [...colorMap.values()];
  const existing: VariantRow[] = p.variants.map((v) => ({ key: variantKey(v.size, v.colorName), id: v.id, size: v.size, colorName: v.colorName, colorHex: v.colorHex, pricePaise: v.pricePaise, stock: v.stock }));
  const rows = buildVariantRows(sizes, colors, existing);
  return {
    name: p.name, slug: p.slug, description: p.description, fit: p.fit, fabric: p.fabric,
    priceText: paiseToRupees(p.basePricePaise), compareAtText: paiseToRupees(p.compareAtPricePaise),
    status: p.status, isCustomizable: p.isCustomizable, collectionIds: [...p.collectionIds],
    sizes, colors: colors.length ? colors : [{ name: "Black", hex: "#111111" }], rows,
    priceTexts: Object.fromEntries(rows.map((r) => [r.key, paiseToRupees(r.pricePaise)])),
    originalRows: existing,
  };
}

/**
 * Recomputes the variant matrix for a new size/color selection, merging in any rows from `state.originalRows`
 * (the server-loaded variants) that aren't currently in `state.rows`. This lets a size or color that was
 * toggled off and back on in the same session recover its variant id, stock, and price override instead of
 * being treated as a brand-new row.
 *
 * A recovered row's price-override *text* is dropped along with it: any edit made before the row was removed
 * is discarded (matching stock, which also reverts to the server value), so the recovered row's displayed
 * text falls back to `paiseToRupees(pricePaise)` and agrees with what `toProductInput` will save. Only rows
 * that stayed in `state.rows` the whole time keep their existing text entry.
 */
export function rebuildRows(state: ProductFormState, sizes: string[], colors: ColorSpec[]): { rows: VariantRow[]; priceTexts: Record<string, string> } {
  const activeKeys = new Set(state.rows.map((r) => r.key));
  const recovered = state.originalRows.filter((o) => !activeKeys.has(o.key));
  const rows = buildVariantRows(sizes, colors, [...state.rows, ...recovered]);
  const rowKeys = new Set(rows.map((r) => r.key));
  const priceTexts = Object.fromEntries(
    Object.entries(state.priceTexts).filter(([key]) => activeKeys.has(key) && rowKeys.has(key)),
  );
  return { rows, priceTexts };
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
  for (const r of s.rows) {
    const text = s.priceTexts[r.key];
    if (text !== undefined && text.trim() && rupeesToPaise(text) === null) {
      errors.variants = [`Fix the price override for ${r.colorName} / ${r.size}`];
      break;
    }
  }
  if (Object.keys(errors).length) return { input: null, errors };
  return {
    errors,
    input: {
      name: s.name, slug: s.slug.trim(), description: s.description, fit: s.fit, fabric: s.fabric,
      basePricePaise: base!, compareAtPricePaise: compareAt, status: s.status, isCustomizable: s.isCustomizable,
      collectionIds: s.collectionIds,
      variants: s.rows.map((r) => {
        const text = s.priceTexts[r.key];
        // priceTexts is the source of truth for a row's override: when the admin has a text entry for this
        // row (even ""), save exactly what it parses to; only fall back to the row's own pricePaise when
        // there's no text entry at all (e.g. a row recovered from originalRows after rebuildRows pruned it).
        const pricePaise = text !== undefined ? (text.trim() ? rupeesToPaise(text) : null) : r.pricePaise;
        return {
          ...(r.id ? { id: r.id } : {}),
          size: r.size as ProductInput["variants"][number]["size"],
          colorName: r.colorName,
          colorHex: r.colorHex,
          pricePaise,
          stock: r.stock,
        };
      }),
    },
  };
}
