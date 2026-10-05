import type { ReviewStatus } from "@prisma/client";
import Link from "next/link";
import { ReviewModerationCard } from "@/components/admin/review-moderation-card";
import { REVIEW_STATUSES } from "@/lib/validation/review";
import { cn } from "@/lib/utils";
import { countPendingReviews, listAdminReviews } from "@/server/services/admin-reviews";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Reviews" };
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);
const MAX_PAGE = 1000;
const EMPTY: Record<ReviewStatus, string> = {
  PENDING: "Nothing waiting for approval.",
  APPROVED: "No approved reviews yet.",
  REJECTED: "No rejected reviews.",
};

function href(status: ReviewStatus, page = 1): string {
  const params = new URLSearchParams();
  if (status !== "PENDING") params.set("status", status);
  if (page > 1) params.set("page", String(page));
  const qs = params.toString();
  return `/admin/reviews${qs ? `?${qs}` : ""}`;
}

export default async function AdminReviewsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireAdminPage();
  const sp = await searchParams;
  const raw = first(sp.status);
  const status: ReviewStatus = (REVIEW_STATUSES as readonly string[]).includes(raw ?? "") ? (raw as ReviewStatus) : "PENDING";
  const page = Math.min(Math.max(1, Math.floor(Number(first(sp.page))) || 1), MAX_PAGE);
  const [list, pending] = await Promise.all([listAdminReviews({ status, page }), countPendingReviews()]);
  const tabs: { status: ReviewStatus; label: string }[] = [
    { status: "PENDING", label: `Pending (${pending})` },
    { status: "APPROVED", label: "Approved" },
    { status: "REJECTED", label: "Rejected" },
  ];

  return (
    <div className="space-y-5 pb-24 lg:pb-0">
      <h1 className="text-4xl sm:text-5xl">Reviews</h1>
      <nav aria-label="Review status" className="-mx-1 flex gap-1 overflow-x-auto whitespace-nowrap px-1 pb-1">
        {tabs.map((t) => (
          <Link key={t.status} href={href(t.status)} aria-current={t.status === status ? "page" : undefined} className={cn("inline-flex min-h-11 shrink-0 items-center rounded-full px-4 text-sm", t.status === status ? "bg-surface-raised text-text" : "text-text-muted hover:text-text")}>
            {t.label}
          </Link>
        ))}
      </nav>

      {list.items.length === 0 ? (
        <p className="py-16 text-center text-text-muted" data-testid="reviews-empty">{EMPTY[status]}</p>
      ) : (
        <ul className="space-y-3">
          {list.items.map((r) => <ReviewModerationCard key={r.id} review={r} />)}
        </ul>
      )}

      {(list.page > 1 || list.hasMore) && (
        <div className="flex items-center justify-between gap-2 text-sm">
          {list.page > 1 ? <Link href={href(status, list.page - 1)} className="inline-flex min-h-11 items-center px-2 hover:underline">← {status === "PENDING" ? "Older" : "Newer"}</Link> : <span />}
          {list.hasMore && list.page < MAX_PAGE ? <Link href={href(status, list.page + 1)} className="inline-flex min-h-11 items-center px-2 hover:underline">{status === "PENDING" ? "Newer" : "Older"} →</Link> : <span />}
        </div>
      )}
    </div>
  );
}
