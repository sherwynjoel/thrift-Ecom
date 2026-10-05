"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { ChevronDown, ChevronUp, Type } from "lucide-react";
import { toast } from "sonner";
import { moveBannerAction } from "@/app/admin/banners/actions";
import { promoWindow } from "@/components/admin/promo-state-pill";
import { BANNER_STATE_LABEL, type BannerState } from "@/lib/banner-schedule";
import { cn } from "@/lib/utils";
import type { AdminBannerRow } from "@/server/services/banners";

const TONE: Record<BannerState, string> = {
  live: "bg-brand text-brand-ink",
  scheduled: "bg-surface-raised text-text",
  expired: "border border-border text-text-muted",
  off: "border border-border text-text-muted",
};
const ARROW = "inline-flex size-11 items-center justify-center rounded-md text-text-muted hover:bg-surface-raised hover:text-text disabled:pointer-events-none disabled:opacity-30";

export function BannerList({ rows, empty }: { rows: AdminBannerRow[]; empty: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (rows.length === 0) return <p className="rounded-md border border-dashed border-border p-6 text-sm text-text-muted">{empty}</p>;

  const move = (id: string, direction: "up" | "down") =>
    start(async () => {
      try {
        const r = await moveBannerAction(id, direction);
        if (!r.ok) return void toast.error(r.message);
        router.refresh();
      } catch {
        toast.error("Something went wrong. Please try again.");
      }
    });

  return (
    <ul className="divide-y divide-border rounded-md border border-border">
      {rows.map((row, i) => (
        <li key={row.id} data-testid="banner-row" className="flex items-center gap-3 p-3">
          <div className="relative grid h-10 w-16 shrink-0 place-items-center overflow-hidden rounded-sm bg-surface-raised text-text-muted">
            {row.placement === "HERO" && row.imageUrl ? <Image src={row.imageUrl} alt="" fill sizes="64px" className="object-cover" /> : <Type className="size-4" aria-hidden="true" />}
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{row.title}</p>
            <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-text-muted">
              <span className={cn("inline-flex whitespace-nowrap rounded-full px-2 py-0.5 font-medium uppercase tracking-wide", TONE[row.state])}>{BANNER_STATE_LABEL[row.state]}</span>
              {(row.startsAt || row.endsAt) && <span>{promoWindow(row)}</span>}
            </p>
          </div>
          <div className="flex shrink-0 items-center">
            <button type="button" className={ARROW} disabled={pending || i === 0} onClick={() => move(row.id, "up")} aria-label={`Move ${row.title} up`}><ChevronUp className="size-5" /></button>
            <button type="button" className={ARROW} disabled={pending || i === rows.length - 1} onClick={() => move(row.id, "down")} aria-label={`Move ${row.title} down`}><ChevronDown className="size-5" /></button>
            <Link href={`/admin/banners/${row.id}`} className="inline-flex min-h-11 items-center px-3 text-sm font-medium underline-offset-4 hover:underline">Edit</Link>
          </div>
        </li>
      ))}
    </ul>
  );
}
