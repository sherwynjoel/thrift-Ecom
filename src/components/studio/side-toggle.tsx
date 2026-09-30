"use client";

import type { DesignSide } from "@/lib/studio/constants";
import { cn } from "@/lib/utils";

const SIDES: { id: DesignSide; label: string }[] = [
  { id: "front", label: "Front" },
  { id: "back", label: "Back" },
];

/** Front/back segmented control. The badge shows how many layers each side holds. */
export function SideToggle({ side, onSide, counts }: { side: DesignSide; onSide: (s: DesignSide) => void; counts: Record<DesignSide, number> }) {
  return (
    <div role="group" aria-label="Side" className="inline-flex shrink-0 rounded-full border border-border bg-surface p-1">
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
              "inline-flex min-h-11 min-w-24 items-center justify-center gap-2 rounded-full px-4 font-display text-lg tracking-wide motion-safe:transition-colors",
              active ? "bg-brand text-brand-ink" : "text-text-muted hover:text-text",
            )}
          >
            {s.label}
            {n > 0 && (
              <span className={cn("inline-flex min-w-5 items-center justify-center rounded-full px-1.5 font-sans text-[11px] font-semibold leading-5", active ? "bg-brand-ink text-brand" : "bg-surface-raised text-text")}>
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
