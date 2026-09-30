import { z } from "zod";
import { blankToNull } from "@/lib/validation/common";

// Dates arrive as ISO strings the admin's browser built from its datetime-local input
// (`new Date(value).toISOString()`), so the server never has to guess a time zone.
const dateField = z.preprocess(
  (v) => {
    const b = blankToNull(v);
    return typeof b === "string" ? new Date(b) : b;
  },
  z.date({ invalid_type_error: "Enter a valid date" }).nullable(),
);
const optionalInt = (min: number, max: number, message: string) =>
  z.preprocess(blankToNull, z.number().int().min(min, message).max(max).nullable());

export const couponInputSchema = z
  .object({
    code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{3,24}$/, "Use 3–24 letters, numbers, - or _"),
    type: z.enum(["PERCENT", "FLAT"]),
    value: z.number().int(),
    minSubtotalPaise: z.number().int().min(0).max(10_000_000),
    maxDiscountPaise: optionalInt(100, 10_000_000, "Cap must be at least ₹1"),
    startsAt: dateField,
    endsAt: dateField,
    usageLimit: optionalInt(1, 1_000_000, "Use at least 1"),
    perUserLimit: optionalInt(1, 1000, "Use at least 1"),
    active: z.boolean(),
  })
  .superRefine((v, ctx) => {
    if (v.type === "PERCENT" && (v.value < 1 || v.value > 90)) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Percent must be between 1 and 90" });
    if (v.type === "FLAT" && v.value < 100) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Flat discount must be at least ₹1" });
    if (v.type === "FLAT" && v.value > 10_000_000) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["value"], message: "Flat discount must be ₹1,00,000 or less" });
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "End must be after start" });
  });
export type CouponInput = z.input<typeof couponInputSchema>;

export const offerInputSchema = z
  .object({
    label: z.string().trim().min(3, "Give the offer a short name").max(60),
    type: z.enum(["BUNDLE_PRICE", "QTY_PERCENT"]),
    minQty: z.number().int().min(2, "At least 2 items").max(20),
    pricePaise: optionalInt(100, 10_000_000, "Price must be at least ₹1"),
    percent: optionalInt(1, 90, "Percent must be between 1 and 90"),
    collectionId: z.preprocess(blankToNull, z.string().min(1).nullable()),
    active: z.boolean(),
    startsAt: dateField,
    endsAt: dateField,
  })
  .superRefine((v, ctx) => {
    if (v.type === "BUNDLE_PRICE" && v.pricePaise === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["pricePaise"], message: "Enter the bundle price" });
    if (v.type === "QTY_PERCENT" && v.percent === null) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["percent"], message: "Enter the percent off" });
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["endsAt"], message: "End must be after start" });
  });
export type OfferInput = z.input<typeof offerInputSchema>;
