import { z } from "zod";
import { GST_STATE_CODES, INDIA_STATES } from "@/lib/india-states";
import { blankToNull, phoneSchema } from "@/lib/validation/common";

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const pct = z.number().int().min(0).max(28);

export const settingsInputSchema = z.object({
  shippingFeePaise: z.number().int().min(0).max(100_000),
  freeShippingThresholdPaise: z.number().int().min(0).max(10_000_000),
  lowStockThreshold: z.number().int().min(0).max(1000),
  adminNotifyEmail: z.preprocess(blankToNull, z.string().trim().toLowerCase().email("Enter a valid email").max(200).nullable()),
  sellerName: z.string().trim().min(2, "Enter the business name").max(120),
  sellerAddress: z.string().trim().max(500),
  sellerState: z.union([z.enum(INDIA_STATES), z.literal("")]),
  gstin: z.preprocess(blankToNull, z.string().trim().toUpperCase().regex(GSTIN, "Enter a valid 15-character GSTIN").nullable()),
  gstRateLowPct: pct,
  gstRateHighPct: pct,
  gstThresholdPaise: z.number().int().min(0).max(10_000_000),
  whatsappNumber: z.preprocess(blankToNull, phoneSchema.nullable()),
  dailySummaryEnabled: z.boolean(),
  abandonedCartEnabled: z.boolean(),
  customFrontFeePaise: z.number().int().min(0).max(1_000_000).optional(),
  customBackFeePaise: z.number().int().min(0).max(1_000_000).optional(),
}).superRefine((v, ctx) => {
  if (v.gstRateLowPct > v.gstRateHighPct) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["gstRateLowPct"], message: "The lower-slab rate can't be higher than the rate above the threshold" });
  }
  // A GSTIN starts with the GST code of the state it is registered in; it must match the seller state printed on invoices.
  if (v.gstin) {
    if (!v.sellerState) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["sellerState"], message: "Choose the state your GSTIN is registered in" });
    } else if (v.gstin.slice(0, 2) !== GST_STATE_CODES[v.sellerState]) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["gstin"], message: `This GSTIN isn't registered in ${v.sellerState} (it should start with ${GST_STATE_CODES[v.sellerState]})` });
    }
  }
});

export type SettingsInput = z.input<typeof settingsInputSchema>;
