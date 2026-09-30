import { SIZES } from "@/lib/sizes";

export interface ColorSpec {
  name: string;
  hex: string;
}
export interface VariantRow {
  key: string;
  id?: string;
  size: string;
  colorName: string;
  colorHex: string;
  pricePaise: number | null;
  stock: number;
}

const order = new Map<string, number>(SIZES.map((s, i) => [s, i]));

export function variantKey(size: string, colorName: string): string {
  return `${size}|${colorName.trim().toLowerCase()}`;
}

export function buildVariantRows(sizes: string[], colors: ColorSpec[], existing: VariantRow[]): VariantRow[] {
  const byKey = new Map(existing.map((r) => [variantKey(r.size, r.colorName), r]));
  const seen = new Set<string>();
  const cleanColors = colors
    .map((c) => ({ name: c.name.trim(), hex: c.hex }))
    .filter((c) => {
      const k = c.name.toLowerCase();
      if (!k || seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  const sortedSizes = [...new Set(sizes)].sort((a, b) => (order.get(a) ?? 99) - (order.get(b) ?? 99));
  const rows: VariantRow[] = [];
  for (const c of cleanColors) {
    for (const size of sortedSizes) {
      const key = variantKey(size, c.name);
      const prev = byKey.get(key);
      rows.push({ key, id: prev?.id, size, colorName: c.name, colorHex: c.hex, pricePaise: prev?.pricePaise ?? null, stock: prev?.stock ?? 0 });
    }
  }
  return rows;
}
