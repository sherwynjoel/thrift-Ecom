"use client";

import type { DesignSide } from "@/lib/studio/constants";
import { cn } from "@/lib/utils";

const SIDES: { id: DesignSide; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
];

/** Front/back segmented control. The badge shows how many layers each side holds. */
export function SideToggle({ side, onSide, counts, orientation = "horizontal" }: {
  side: DesignSide; onSide: (s: DesignSide) => void; counts: Record<DesignSide, number>;
  /** Vertical: the slim column used beside the stage on phones while the tool sheet is open. */
  orientation?: "horizontal" | "vertical";
}) {
  const vertical = orientation === "vertical";
  return (
    <div role="group" aria-label="Side" className={cn("inline-flex shrink-0 rounded-full border border-border bg-surface p-1", vertical && "flex-col gap-1 rounded-3xl")}>
      {SIDES.map((s) => {
        const active = s.id === side;
        const n = counts[s.id];
        return (
          <button
            key={s.id}
            type="button"
            aria-pressed={active}
            onClick={() => onSide(s.id)}
            data-testid={`studio-side-${s.id}`}
            className={cn(
              "relative inline-flex min-h-11 items-center justify-center gap-2 rounded-full font-display tracking-wide motion-safe:transition-colors",
              vertical ? "min-w-11 px-1 text-sm" : "min-w-24 px-4 text-lg",
              active ? "bg-brand text-brand-ink" : "text-text-muted hover:text-text",
            )}
          >
            {s.label}
            {n > 0 && (
              <span className={cn("inline-flex min-w-5 items-center justify-center rounded-full px-1.5 font-sans text-[11px] font-semibold leading-5", active ? "bg-brand-ink text-brand" : "bg-surface-raised text-text", vertical && "absolute -right-1.5 -top-1.5 min-w-4 px-1 text-[10px] leading-4 ring-2 ring-bg")}>
                {n}
                <span className="sr-only"> ({n} layers)</span>
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
