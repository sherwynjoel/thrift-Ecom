import { z } from "zod";
import { SIZES } from "@/lib/sizes";

const paise = z.number().int().min(0).max(100_000_00);
const slugField = z
  .string()
  .trim()
  .max(140)
  .refine((s) => s === "" || /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s), "Use lowercase letters, numbers, and single hyphens");

export const hexColorSchema = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Use a hex color like #111111");

export const variantInputSchema = z.object({
  id: z.string().min(1).optional(),
  size: z.enum(SIZES),
  colorName: z.string().trim().min(1, "Name the color").max(40),
  colorHex: hexColorSchema,
  pricePaise: paise.min(1).nullable(),
  stock: z.number().int().min(0, "Stock cannot be negative").max(100_000),
  /** Stock as originally loaded into the editor, for an existing variant (has `id`). The service applies
   * `stock - originalStock` as a delta rather than writing `stock` as an absolute value, so a save from a
   * form that has been open a while doesn't clobber stock changes made elsewhere (e.g. by checkout) in the
   * meantime. Omitted for new variants, where `stock` is written as-is. */
  originalStock: z.number().int().min(0).max(100_000).optional(),
});

export const productInputSchema = z
  .object({
    name: z.string().trim().min(2, "Name is too short").max(120),
    slug: slugField,
    description: z.string().max(5000),
    fit: z.enum(["OVERSIZED", "REGULAR", "RELAXED"]),
    fabric: z.string().trim().min(1, "Describe the fabric").max(120),
    basePricePaise: paise.min(100, "Price must be at least ₹1"),
    compareAtPricePaise: paise.nullable(),
    status: z.enum(["DRAFT", "ACTIVE", "ARCHIVED"]),
    isCustomizable: z.boolean(),
    collectionIds: z.array(z.string().min(1)).max(50),
    variants: z.array(variantInputSchema).max(200),
  })
  .superRefine((v, ctx) => {
    if (v.compareAtPricePaise !== null && v.compareAtPricePaise <= v.basePricePaise) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["compareAtPricePaise"], message: "Compare-at price must be higher than the price" });
    }
    if (v.status === "ACTIVE" && v.variants.length === 0) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variants"], message: "Add at least one size and color before publishing" });
    }
    const seen = new Set<string>();
    v.variants.forEach((variant, i) => {
      const k = `${variant.size}|${variant.colorName.trim().toLowerCase()}`;
      if (seen.has(k)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["variants", i], message: `Duplicate ${variant.size} / ${variant.colorName}` });
      seen.add(k);
    });
  });

export const collectionInputSchema = z.object({
  name: z.string().trim().min(2, "Name is too short").max(80),
  slug: slugField,
  description: z.string().max(1000),
  isFeatured: z.boolean(),
  isActive: z.boolean(),
  sortOrder: z.number().int().min(0).max(10_000),
});

export const imageUpdateSchema = z.object({
  alt: z.string().trim().max(200),
  colorName: z.string().trim().max(40).nullable(),
});

export type VariantInput = z.infer<typeof variantInputSchema>;
export type ProductInput = z.infer<typeof productInputSchema>;
export type CollectionInput = z.infer<typeof collectionInputSchema>;
export type ImageUpdate = z.infer<typeof imageUpdateSchema>;
