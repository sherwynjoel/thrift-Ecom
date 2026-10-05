import { z } from "zod";
import { safeHrefSchema } from "@/lib/safe-href";
import { blankToNull, optionalText } from "@/lib/validation/common";

export const BANNER_PLACEMENTS = ["HERO", "STRIP"] as const;

const when = z.preprocess(blankToNull, z.coerce.date({ invalid_type_error: "Enter a valid date" }).nullable());

export const bannerInputSchema = z
  .object({
    title: z.string().trim().min(2, "Enter a title").max(80, "Keep the title under 80 characters"),
    subtitle: optionalText(160),
    ctaLabel: optionalText(30),
    ctaHref: z.preprocess(blankToNull, safeHrefSchema.nullable()),
    placement: z.enum(BANNER_PLACEMENTS),
    active: z.boolean(),
    startsAt: when,
    endsAt: when,
  })
  .superRefine((v, ctx) => {
    if (v.startsAt && v.endsAt && v.endsAt <= v.startsAt) {
      ctx.addIssue({ code: "custom", path: ["endsAt"], message: "The end must be after the start" });
    }
    if (v.placement === "HERO" && Boolean(v.ctaLabel) !== Boolean(v.ctaHref)) {
      ctx.addIssue({ code: "custom", path: [v.ctaLabel ? "ctaHref" : "ctaLabel"], message: v.ctaLabel ? "Add a link for the button" : "Add a label for the button" });
    }
  });

export type BannerInput = z.input<typeof bannerInputSchema>;
