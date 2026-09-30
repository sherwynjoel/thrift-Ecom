"use client";

import { ArrowDown, ArrowUp, Image as ImageIcon, Trash2, Type } from "lucide-react";
import { cn } from "@/lib/utils";
import { DpiChip } from "./dpi-chip";
import type { LayerInfo } from "./use-studio-canvas";

const iconButton = "inline-flex size-11 shrink-0 items-center justify-center rounded-md text-text-muted hover:bg-surface-raised hover:text-text disabled:pointer-events-none disabled:opacity-30";

export function LayersPanel({ layers, onSelect, onForward, onBackward, onRemove }: {
  layers: LayerInfo[]; onSelect(i: number): void; onForward(): void; onBackward(): void; onRemove(): void;
}) {
  if (layers.length === 0) {
    return <p className="rounded-md border border-dashed border-border px-3 py-6 text-center text-sm text-text-muted" data-testid="layers-empty">Nothing on this side yet. Add text or upload an image.</p>;
  }
  return (
    <ol aria-label="Layers" className="space-y-1.5" data-testid="layers-panel">
      {layers.map((l, pos) => {
        const Icon = l.kind === "text" ? Type : ImageIcon;
        const act = (fn: () => void) => () => {
          onSelect(l.index);
          fn();
        };
        return (
          <li
            key={l.index}
            data-testid="layer-item"
            className={cn("rounded-md border bg-surface motion-safe:transition-colors", l.selected ? "border-brand" : "border-border")}
          >
            <div className="flex items-center gap-1 pr-1">
              <button
                type="button"
                aria-pressed={l.selected}
                onClick={() => onSelect(l.index)}
                className="flex min-h-11 min-w-0 flex-1 items-center gap-3 rounded-md px-3 text-left"
              >
                <Icon aria-hidden className={cn("size-4 shrink-0", l.selected ? "text-brand" : "text-text-muted")} />
                <span className="truncate text-sm">{l.label}</span>
              </button>
              <button type="button" aria-label="Bring forward" onClick={act(onForward)} disabled={pos === 0} className={iconButton}>
                <ArrowUp aria-hidden className="size-4" />
              </button>
              <button type="button" aria-label="Send backward" onClick={act(onBackward)} disabled={pos === layers.length - 1} className={iconButton}>
                <ArrowDown aria-hidden className="size-4" />
              </button>
              <button type="button" aria-label="Delete layer" onClick={act(onRemove)} className={cn(iconButton, "hover:text-danger")}>
                <Trash2 aria-hidden className="size-4" />
              </button>
            </div>
            {l.dpi !== null && <DpiChip dpi={l.dpi} className="mb-2 ml-10" />}
          </li>
        );
      })}
    </ol>
  );
}
