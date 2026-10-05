import { z } from "zod";
import { optionalText } from "@/lib/validation/common";

export const REVIEW_BODY_MAX = 1000;
export const REVIEWS_PAGE_SIZE = 10;
export const REVIEW_STATUSES = ["PENDING", "APPROVED", "REJECTED"] as const;

export const reviewInputSchema = z.object({
  rating: z.number({ required_error: "Pick a rating", invalid_type_error: "Pick a rating" }).int().min(1, "Pick a rating").max(5, "Pick a rating"),
  title: optionalText(80),
  body: z.string().trim().max(REVIEW_BODY_MAX, `Keep your review under ${REVIEW_BODY_MAX} characters`).default(""),
});

export type ReviewInput = z.input<typeof reviewInputSchema>;
