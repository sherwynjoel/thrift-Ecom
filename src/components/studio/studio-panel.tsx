"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";

export type StudioTab = "product" | "upload" | "text" | "layers";

/**
 * Desktop: the right-hand tool column. Mobile: a non-modal bottom sheet (tab row + sticky price footer);
 * tapping a tab expands the content to at most 40dvh, the chevron collapses it. One DOM for both layouts.
 */
export function StudioPanel({ tab, onTab, expanded, onExpanded, tabs, footer }: {
  tab: StudioTab; onTab: (t: StudioTab) => void; expanded: boolean; onExpanded: (v: boolean) => void;
  tabs: { id: StudioTab; label: string; content: React.ReactNode }[]; footer: React.ReactNode;
}) {
  return (
    <aside
      data-testid="studio-sheet"
      data-expanded={expanded}
      data-sticky-bar
      aria-label="Design tools"
      className="fixed inset-x-0 bottom-0 z-30 flex max-h-[85dvh] flex-col rounded-t-xl border-t border-border bg-bg/95 shadow-[0_-12px_32px_rgba(0,0,0,0.55)] backdrop-blur md:sticky md:top-24 md:z-auto md:max-h-[calc(100dvh-7rem)] md:self-start md:rounded-md md:border md:bg-bg md:shadow-none md:backdrop-blur-none"
    >
      <div className="flex items-center gap-1 border-b border-border px-2" role="tablist" aria-label="Tools">
        {tabs.map((t) => {
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              role="tab"
              id={`studio-tab-${t.id}`}
              aria-selected={active}
              aria-controls="studio-tabpanel"
              data-testid={`studio-tab-${t.id}`}
              onClick={() => { onTab(t.id); onExpanded(true); }}
              className={cn(
                "relative min-h-12 flex-1 rounded-md px-2 font-display text-lg tracking-wide motion-safe:transition-colors",
                active ? "text-text" : "text-text-muted hover:text-text",
                "after:absolute after:inset-x-3 after:-bottom-px after:h-0.5 after:rounded-full",
                active && "after:bg-brand",
              )}
            >
              {t.label}
            </button>
          );
        })}
        <button
          type="button"
          onClick={() => onExpanded(!expanded)}
          aria-expanded={expanded}
          aria-controls="studio-tabpanel"
          className="flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:text-text md:hidden"
          aria-label={expanded ? "Hide tools" : "Show tools"}
          data-testid="studio-sheet-toggle"
        >
          {expanded ? <ChevronDown className="size-5" /> : <ChevronUp className="size-5" />}
        </button>
      </div>
      <div
        id="studio-tabpanel"
        role="tabpanel"
        aria-labelledby={`studio-tab-${tab}`}
        data-lenis-prevent
        className={cn("min-h-0 overflow-y-auto overscroll-contain p-4", expanded ? "max-h-[40dvh]" : "hidden", "md:block md:max-h-none md:flex-1")}
      >
        {tabs.find((t) => t.id === tab)?.content}
      </div>
      <div className="border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] md:p-4">{footer}</div>
    </aside>
  );
}
