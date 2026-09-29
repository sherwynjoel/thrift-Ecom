export const SIZES = ["XS", "S", "M", "L", "XL", "XXL", "3XL"] as const;
export type Size = (typeof SIZES)[number];
export function isSize(value: string): value is Size {
  return (SIZES as readonly string[]).includes(value);
}
