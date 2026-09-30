import { z } from "zod";
import { CARRIER_IDS } from "@/lib/carriers";
import { isHttpUrl } from "@/lib/url";
import { blankToNull } from "@/lib/validation/common";

export const trackingInputSchema = z.object({
  carrier: z.enum(CARRIER_IDS, { errorMap: () => ({ message: "Choose a carrier" }) }),
  trackingNumber: z.string().trim().min(4, "Enter the tracking number").max(40).regex(/^[A-Za-z0-9-]+$/, "Use letters, numbers and dashes only"),
  trackingUrl: z.preprocess(
    blankToNull,
    z.string().trim().url("Enter a full link").max(500).refine(isHttpUrl, "Use an http(s) link").nullable(),
  ),
});
export type TrackingInput = z.input<typeof trackingInputSchema>;

export const adminNoteSchema = z.string().max(2000, "Keep notes under 2000 characters");
export const cancelReasonSchema = z.string().trim().max(200, "Keep the reason under 200 characters");

export const fulfilmentStatusSchema = z.enum(["PROCESSING", "SHIPPED", "DELIVERED"], { errorMap: () => ({ message: "Choose a valid status" }) });
export const manualRefundNoteSchema = z
  .string({ required_error: "Say where the refund was made" })
  .trim()
  .min(3, "Say where the refund was made (for example the Razorpay refund id)")
  .max(200, "Keep the note under 200 characters");
