"use client";

import { useMemo, useState } from "react";
import { colorsOf, defaultColor, sizesFor } from "@/lib/variant-matrix";
import { PRINT_AREA, CANVAS_HEIGHT, CANVAS_WIDTH, type DesignSide } from "@/lib/studio/constants";
import type { SideJson } from "@/lib/studio/canvas-json";
import { isDarkHex } from "@/lib/studio/shirt";
import { cn } from "@/lib/utils";
import type { StudioProduct } from "@/server/services/designs";
import { STUDIO_FONT_CLASSNAMES } from "./fonts";
import { PriceSummary } from "./price-summary";
import { ProductPanel } from "./product-panel";
import { ShirtSvg } from "./shirt-svg";
import { SideToggle } from "./side-toggle";
import { StudioPanel, type StudioTab } from "./studio-panel";

export interface StudioInitialDesign { designId: string; colorName: string; front: SideJson; back: SideJson }
export interface StudioProps { product: StudioProduct; initialColor: string | null; initialDesign: StudioInitialDesign | null }

// The print area as percentages of the stage, so overlays line up with the SVG guide at every width.
const PRINT_BOX = {
  left: `${(PRINT_AREA.left / CANVAS_WIDTH) * 100}%`,
  top: `${(PRINT_AREA.top / CANVAS_HEIGHT) * 100}%`,
  width: `${(PRINT_AREA.width / CANVAS_WIDTH) * 100}%`,
  height: `${(PRINT_AREA.height / CANVAS_HEIGHT) * 100}%`,
};

// next/font classNames set font-family, so each one goes on its own invisible sample instead of the page root.
const FONT_SAMPLES = STUDIO_FONT_CLASSNAMES.split(" ").filter(Boolean);

export function Studio({ product, initialColor, initialDesign }: StudioProps) {
  const [color, setColor] = useState<string | null>(initialColor ?? defaultColor(product.variants));
  const [size, setSize] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState(false);
  const [side, setSide] = useState<DesignSide>("front");
  const [tab, setTab] = useState<StudioTab>("product");
  const [expanded, setExpanded] = useState(false);
  const hex = colorsOf(product.variants).find((c) => c.name === color)?.hex ?? "#f5f5f5";
  const chosen = useMemo(() => (color ? sizesFor(product.variants, color).find((s) => s.size === size) ?? null : null), [product.variants, color, size]);
  const counts = { front: initialDesign?.front.objects.length ?? 0, back: initialDesign?.back.objects.length ?? 0 }; // replaced by live counts in Task 6
  const sides = { front: counts.front > 0, back: counts.back > 0 };
  const dark = isDarkHex(hex);

  return (
    <div data-testid="studio-page" data-ready="false" data-object-count={counts[side]} className="relative grid gap-4 md:grid-cols-[minmax(0,1fr)_380px] md:gap-8">
      {FONT_SAMPLES.map((c) => (
        <span key={c} aria-hidden className={cn(c, "pointer-events-none absolute size-px overflow-hidden opacity-0")}>Aa</span>
      ))}
      <section aria-label="Design preview" className="min-w-0 space-y-3 sm:mx-auto sm:w-full sm:max-w-[640px] md:max-w-[min(640px,calc((100dvh-12rem)*0.8))]">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <p className="text-xs uppercase tracking-[0.3em] text-brand">Design studio</p>
            <h1 className="mt-1 text-3xl leading-none md:text-5xl">{product.name}</h1>
          </div>
          <SideToggle side={side} onSide={setSide} counts={counts} />
        </div>
        <div
          className="relative -mx-4 aspect-[4/5] touch-none select-none overflow-hidden bg-surface sm:mx-0 sm:rounded-md sm:border sm:border-border"
          data-testid="studio-stage"
          data-side={side}
        >
          <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,var(--surface-raised)_0%,transparent_70%)]" />
          <ShirtSvg hex={hex} side={side} className="absolute inset-0" />
          {/* Task 6 mounts the Fabric canvas in this slot, absolutely positioned over the SVG in the same 800 × 1000 space. */}
          <div className="absolute inset-0" data-testid="studio-surface">
            {counts[side] === 0 && (
              <div
                className={cn("pointer-events-none absolute flex flex-col items-center justify-center gap-1 p-2 text-center", dark ? "text-white/60" : "text-black/55")}
                style={PRINT_BOX}
                data-testid="studio-empty-hint"
              >
                <span className="font-display text-base uppercase leading-none tracking-wide sm:text-xl">Your design here</span>
                <span className="text-[10px] leading-tight sm:text-xs">12 × 16 in print area</span>
              </div>
            )}
          </div>
          <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-bg/70 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-text-muted backdrop-blur">
            {side === "front" ? "Front" : "Back"} · {color}
          </p>
        </div>
      </section>
      <StudioPanel
        tab={tab}
        onTab={setTab}
        expanded={expanded}
        onExpanded={setExpanded}
        tabs={[{ id: "product", label: "Product", content: <ProductPanel product={product} color={color} size={size} sizeError={sizeError} onColor={(c) => { setColor(c); setSize(null); }} onSize={(s) => { setSize(s); setSizeError(false); }} /> }]}
        footer={
          <div className="flex items-center justify-between gap-3">
            <PriceSummary basePricePaise={chosen?.pricePaise ?? product.basePricePaise} fees={product.fees} sides={sides} />
            <button type="button" disabled className="h-11 shrink-0 rounded-md bg-brand px-5 font-display text-lg tracking-wide text-brand-ink disabled:cursor-not-allowed disabled:opacity-50" data-testid="studio-add-to-cart">Add to cart</button>
          </div>
        }
      />
    </div>
  );
}
