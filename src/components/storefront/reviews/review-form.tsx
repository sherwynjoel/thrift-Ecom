"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Star } from "lucide-react";
import { toast } from "sonner";
import { createReviewAction } from "@/app/(storefront)/products/[slug]/review-actions";
import { FieldError } from "@/components/admin/field-error";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { REVIEW_BODY_MAX } from "@/lib/validation/review";
import { cn } from "@/lib/utils";

export function ReviewForm({ productId }: { productId: string }) {
  const [rating, setRating] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const submit = () => {
    if (!rating) return;
    start(async () => {
      try {
        const r = await createReviewAction(productId, { rating, title, body });
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          toast.error(r.message);
          return;
        }
        setErrors({});
        toast.success(r.data.status === "APPROVED" ? "Thanks! Your review is live." : "Thanks! Your review will appear after a quick check.");
        router.refresh();
      } catch {
        toast.error("Something went wrong. Please try again.");
      }
    });
  };

  const lit = hover ?? rating ?? 0;
  return (
    <form onSubmit={(e) => { e.preventDefault(); submit(); }} className="max-w-xl space-y-4" data-testid="review-form" noValidate>
      <fieldset>
        <legend className="text-sm">Your rating</legend>
        <div className="mt-1 flex" onPointerLeave={() => setHover(null)}>
          {[1, 2, 3, 4, 5].map((n) => (
            <label key={n} onPointerEnter={() => setHover(n)} className="inline-flex size-11 cursor-pointer items-center justify-center rounded-md has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand">
              <input type="radio" name="rating" value={n} className="sr-only" checked={rating === n} onChange={() => setRating(n)} />
              <Star className={cn("size-7", n <= lit ? "fill-brand text-brand" : "text-border")} aria-hidden="true" />
              <span className="sr-only">{n} star{n > 1 ? "s" : ""}</span>
            </label>
          ))}
        </div>
        <FieldError errors={errors.rating} />
      </fieldset>
      <div>
        <Label htmlFor="review-title">Title (optional)</Label>
        <Input id="review-title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} autoComplete="off" className="mt-1 h-11" />
        <FieldError errors={errors.title} />
      </div>
      <div>
        <div className="flex items-baseline justify-between gap-2">
          <Label htmlFor="review-body">Your review</Label>
          <span className="text-xs text-text-muted" aria-hidden="true">{body.length}/{REVIEW_BODY_MAX}</span>
        </div>
        <textarea id="review-body" value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={REVIEW_BODY_MAX} className="mt-1 w-full rounded-md border border-border bg-surface p-3 text-base md:text-sm" />
        <FieldError errors={errors.body} />
      </div>
      <Button type="submit" disabled={pending || !rating} className="h-11 w-full sm:w-auto" data-testid="post-review">
        {pending ? "Posting…" : "Post review"}
      </Button>
    </form>
  );
}
