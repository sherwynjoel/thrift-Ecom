"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { toast } from "sonner";
import { moderateReviewAction } from "@/app/admin/reviews/actions";
import { RatingStars } from "@/components/storefront/reviews/rating-stars";
import { Button } from "@/components/ui/button";
import { formatDateIst } from "@/lib/dates";
import type { AdminReviewRow } from "@/server/services/admin-reviews";

export function ReviewModerationCard({ review: r }: { review: AdminReviewRow }) {
  const [pending, start] = useTransition();
  const router = useRouter();

  const moderate = (status: "APPROVED" | "REJECTED") =>
    start(async () => {
      try {
        const res = await moderateReviewAction(r.id, status);
        if (!res.ok) {
          toast.error(res.message);
          return;
        }
        toast.success(status === "APPROVED" ? "Review approved" : "Review rejected");
        router.refresh();
      } catch {
        toast.error("Something went wrong. Please try again.");
      }
    });

  return (
    <li data-testid="review-card" className="space-y-2 rounded-md border border-border bg-surface p-4">
      <div className="flex items-center gap-2">
        <RatingStars rating={r.rating} />
        <span className="text-sm tabular-nums text-text-muted" aria-hidden="true">{r.rating}/5</span>
      </div>
      {r.title && <p className="font-medium">{r.title}</p>}
      {r.body ? <p className="whitespace-pre-line text-sm">{r.body}</p> : <p className="text-sm italic text-text-muted">No written review</p>}
      <p className="text-xs text-text-muted">
        <a href={`/products/${r.productSlug}`} target="_blank" rel="noreferrer" className="underline-offset-4 hover:text-text hover:underline">{r.productName}</a>
        {" · "}{r.authorName ? `${r.authorName} (${r.authorEmail})` : r.authorEmail}
        {" · "}<Link href={`/admin/orders/${r.orderId}`} className="underline-offset-4 hover:text-text hover:underline">{r.orderNumber}</Link>
        {" · "}{formatDateIst(r.createdAt)}
      </p>
      <div className="flex flex-wrap gap-2 pt-1">
        {r.status !== "APPROVED" && (
          <Button onClick={() => moderate("APPROVED")} disabled={pending} className="h-11 px-5" data-testid="approve-review">Approve</Button>
        )}
        {r.status !== "REJECTED" && (
          <Button variant="outline" onClick={() => moderate("REJECTED")} disabled={pending} className="h-11 px-5" data-testid="reject-review">Reject</Button>
        )}
      </div>
    </li>
  );
}
