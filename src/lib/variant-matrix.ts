import { SIZES } from "@/lib/sizes";

export interface VariantLike {
  id: string;
  size: string;
  colorName: string;
  colorHex: string;
  stock: number;
  pricePaise: number;
}

const order = new Map<string, number>(SIZES.map((s, i) => [s, i]));

export function colorsOf(variants: VariantLike[]): { name: string; hex: string }[] {
  const seen = new Map<string, string>();
  for (const v of variants) if (!seen.has(v.colorName)) seen.set(v.colorName, v.colorHex);
  return [...seen].map(([name, hex]) => ({ name, hex }));
}

export function sizesFor(variants: VariantLike[], colorName: string) {
  return variants
    .filter((v) => v.colorName === colorName)
    .sort((a, b) => (order.get(a.size) ?? 99) - (order.get(b.size) ?? 99))
    .map((v) => ({ size: v.size, stock: v.stock, variantId: v.id, pricePaise: v.pricePaise }));
}

export function defaultColor(variants: VariantLike[]): string | null {
  const colors = colorsOf(variants);
  if (!colors.length) return null;
  const withStock = colors.find((c) => variants.some((v) => v.colorName === c.name && v.stock > 0));
  return (withStock ?? colors[0]).name;
}
