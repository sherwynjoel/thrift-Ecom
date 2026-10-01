"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Info, Loader2, RotateCw } from "lucide-react";
import { colorsOf, defaultColor, sizesFor } from "@/lib/variant-matrix";
import { PRINT_AREA, CANVAS_HEIGHT, CANVAS_WIDTH, MAX_OBJECTS_PER_SIDE } from "@/lib/studio/constants";
import { dpiLevel, dpiMessage } from "@/lib/studio/dpi";
import { EMPTY_SIDE, type SideJson } from "@/lib/studio/canvas-json";
import { isDarkHex } from "@/lib/studio/shirt";
import { cn } from "@/lib/utils";
import type { StudioProduct } from "@/server/services/designs";
import { useCartUI } from "@/components/storefront/cart-ui";
import { AddToCartBar } from "./add-to-cart-bar";
import { exportSide, submitDesign, uploadAsset } from "./export-design";
import { loadFabric } from "./fabric-types";
import { STUDIO_FONT_CLASSNAMES, STUDIO_FONT_FAMILIES } from "./fonts";
import { LayersPanel } from "./layers-panel";
import { DpiChip } from "./dpi-chip";
import { ObjectToolbar, ObjectToolColumns } from "./object-toolbar";
import { PriceSummary } from "./price-summary";
import { ProductPanel } from "./product-panel";
import { ShirtSvg } from "./shirt-svg";
import { SideToggle } from "./side-toggle";
import { StudioPanel, type StudioTab } from "./studio-panel";
import { TextPanel } from "./text-panel";
import { UploadPanel } from "./upload-panel";
import { STUDIO_ROOT_ATTR, useStudioCanvas } from "./use-studio-canvas";

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

/** Height of the mobile bottom sheet, so the expanded-sheet layout can fit the shirt in the space above it. */
function useElementHeight<T extends HTMLElement>(): [React.RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [h, setH] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setH(Math.round(el.getBoundingClientRect().height)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, h];
}

/** Below the md breakpoint the tools are a bottom sheet (see StudioPanel). */
function useNarrow(): boolean {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767.98px)");
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return narrow;
}

export function Studio({ product, initialColor, initialDesign }: StudioProps) {
  const router = useRouter();
  const [color, setColor] = useState<string | null>(initialColor ?? defaultColor(product.variants));
  const [size, setSize] = useState<string | null>(null);
  const [sizeError, setSizeError] = useState(false);
  const [tab, setTab] = useState<StudioTab>("product");
  const [expanded, setExpanded] = useState(false);
  const [rights, setRights] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [sheetRef, sheetHeight] = useElementHeight<HTMLElement>();
  const narrow = useNarrow();
  // Phone with the tool sheet open: the preview is pinned between the header and the sheet, tools flank the stage.
  const focus = expanded && narrow;
  const hex = colorsOf(product.variants).find((c) => c.name === color)?.hex ?? "#f5f5f5";
  const chosen = useMemo(() => (color ? sizesFor(product.variants, color).find((s) => s.size === size) ?? null : null), [product.variants, color, size]);
  const dark = isDarkHex(hex);
  const inkHex = dark ? "#ffffff" : "#111111"; // only affects newly added text
  const initial = useMemo(() => ({ front: initialDesign?.front ?? EMPTY_SIDE, back: initialDesign?.back ?? EMPTY_SIDE }), [initialDesign]);
  const api = useStudioCanvas({ families: STUDIO_FONT_FAMILIES, initial, inkHex });
  const sides = { front: api.counts.front > 0, back: api.counts.back > 0 };
  const empty = api.counts[api.side] === 0;
  // One polite summary for screen readers; it changes only when the quality level does (not on every scaling frame).
  const dpiLevelNow = api.selectedDpi === null ? "ok" : dpiLevel(api.selectedDpi);
  const dpiAnnouncement = dpiLevelNow === "ok" ? "" : dpiMessage(dpiLevelNow);

  async function add() {
    if (!chosen) {
      setSizeError(true);
      setTab("product");
      setExpanded(true);
      return;
    }
    if (!sides.front && !sides.back) {
      toast.error("Add a design to the front or back first");
      return;
    }
    if (!rights) {
      setExpanded(false); // on mobile the checkbox lives in the collapsed sheet's footer
      toast.error("Please confirm you own the rights to this artwork");
      return;
    }
    setBusy(true);
    setStatus("Preparing print files…");
    try {
      const fabric = await loadFabric();
      const front = api.sideJson("front"), back = api.sideJson("back");
      const exports = {
        front: await exportSide(fabric, front, { families: STUDIO_FONT_FAMILIES, colorHex: hex, side: "front" }),
        back: await exportSide(fabric, back, { families: STUDIO_FONT_FAMILIES, colorHex: hex, side: "back" }),
      };
      setStatus("Uploading your design…");
      await submitDesign({ productId: product.id, variantId: chosen.variantId, quantity: 1, front, back, exports });
      toast.success("Added to your bag");
      setExpanded(false);
      router.refresh();
      useCartUI.getState().setOpen(true);
      setStatus(null);
    } catch (e) {
      setStatus(null);
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function upload(file: File) {
    if (api.layers.length >= MAX_OBJECTS_PER_SIDE) {
      toast.error(`Use at most ${MAX_OBJECTS_PER_SIDE} layers per side`);
      return;
    }
    setUploading(true);
    try {
      await api.addImage((await uploadAsset(file)).url);
      setTab("layers");
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setUploading(false);
    }
  }

  return (
    <div
      data-testid="studio-page"
      data-ready={api.ready ? "true" : "false"}
      data-object-count={api.counts[api.side]}
      data-lenis-prevent
      {...{ [STUDIO_ROOT_ATTR]: "" }}
      className="relative grid gap-4 md:grid-cols-[minmax(0,1fr)_380px] md:gap-8"
      style={{ "--sheet-h": `${sheetHeight}px` } as React.CSSProperties}
    >
      {FONT_SAMPLES.map((c) => (
        <span key={c} aria-hidden className={cn(c, "pointer-events-none absolute size-px overflow-hidden opacity-0")}>Aa</span>
      ))}
      <section
        aria-label="Design preview"
        data-focus={focus ? "true" : "false"}
        className={cn(
          "min-w-0 space-y-3 sm:mx-auto sm:w-full sm:max-w-[640px] md:max-w-[min(640px,calc((100dvh-16rem)*0.8))]",
          // Mobile with the tools open: pin the preview between the header and the sheet so the shirt stays in view.
          focus && "max-md:fixed max-md:inset-x-0 max-md:top-[65px] max-md:bottom-[var(--sheet-h)] max-md:z-20 max-md:m-0 max-md:flex max-md:max-w-none max-md:flex-col max-md:gap-2 max-md:space-y-0 max-md:bg-bg max-md:px-4 max-md:pt-2 max-md:pb-1",
        )}
      >
        {!focus && (
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs uppercase tracking-[0.3em] text-brand">Design studio</p>
              <h1 className="mt-1 text-3xl leading-none md:text-5xl">{product.name}</h1>
            </div>
            <SideToggle side={api.side} onSide={(s) => void api.setSide(s)} counts={api.counts} />
          </div>
        )}
        {initialDesign && !focus && (
          <p role="note" className="flex items-start gap-2 rounded-md border border-brand/40 bg-brand/10 px-3 py-2 text-sm" data-testid="studio-edit-banner">
            <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-brand" />
            You are editing a copy. Your bag keeps the original until you remove it.
          </p>
        )}
        <div className={cn("relative", focus && "flex min-h-0 flex-1 items-center gap-1")}>
          {focus && (
            <div className="flex flex-col items-center gap-2">
              <SideToggle side={api.side} onSide={(s) => void api.setSide(s)} counts={api.counts} orientation="vertical" />
              <ObjectToolColumns api={api} side="left" />
            </div>
          )}
          <div className={cn(focus && "max-md:flex max-md:min-w-0 max-md:flex-1 max-md:items-center max-md:self-stretch max-md:[container-type:size]")}>
            <div
              className={cn(
                "relative -mx-4 aspect-[4/5] touch-pan-y select-none overflow-hidden bg-surface sm:mx-0 sm:rounded-md sm:border sm:border-border",
                focus && "max-md:mx-auto max-md:w-[min(100cqw,80cqh)] max-md:rounded-md max-md:border max-md:border-border",
              )}
              data-testid="studio-stage"
              data-side={api.side}
            >
              <div aria-hidden className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_40%,var(--surface-raised)_0%,transparent_70%)]" />
              <ShirtSvg hex={hex} side={api.side} className="absolute inset-0" />
              {empty && api.ready && (
                <div
                  className={cn("pointer-events-none absolute flex flex-col items-center justify-center gap-1 p-2 text-center", dark ? "text-white/60" : "text-black/55")}
                  style={PRINT_BOX}
                  data-testid="studio-empty-hint"
                >
                  <span className="font-display text-base uppercase leading-none tracking-wide sm:text-xl">Your design here</span>
                  <span className="text-[10px] leading-tight sm:text-xs">12 × 16 in print area</span>
                </div>
              )}
              <div ref={api.hostRef} className="absolute inset-0" data-testid="studio-surface">
                <canvas ref={api.canvasElRef} data-testid="studio-canvas" aria-label={`Design canvas, ${api.side}`} />
              </div>
              {!api.ready && !api.failed && (
                <div className="pointer-events-none absolute inset-0 flex items-center justify-center" aria-hidden>
                  <Loader2 className="size-8 text-text-muted motion-safe:animate-spin" />
                </div>
              )}
              {api.failed && (
                <div role="alert" className="absolute inset-0 flex flex-col items-center justify-center gap-3 bg-bg/80 p-6 text-center backdrop-blur-sm" data-testid="studio-error">
                  <p className="font-display text-2xl uppercase">The editor could not load</p>
                  <p className="text-sm text-text-muted">Check your connection and try again.</p>
                  <button type="button" onClick={api.retry} className="inline-flex h-11 items-center gap-2 rounded-md bg-brand px-5 font-display text-lg tracking-wide text-brand-ink">
                    <RotateCw aria-hidden className="size-4" />
                    Retry
                  </button>
                </div>
              )}
              <p className="pointer-events-none absolute bottom-3 left-3 rounded-full bg-bg/70 px-3 py-1 text-[11px] uppercase tracking-[0.2em] text-text-muted backdrop-blur">
                {api.side === "front" ? "Front" : "Back"} · {color}
              </p>
            </div>
          </div>
          {focus && <ObjectToolColumns api={api} side="right" />}
          {focus && <DpiChip dpi={api.selectedDpi} className="absolute bottom-2 left-1/2 -translate-x-1/2 whitespace-nowrap" />}
        </div>
        {!focus && <ObjectToolbar api={api} />}
        <p role="status" aria-live="polite" className="sr-only" data-testid="dpi-status">{dpiAnnouncement}</p>
      </section>
      <StudioPanel
        sheetRef={sheetRef}
        tab={tab}
        onTab={setTab}
        expanded={expanded}
        onExpanded={setExpanded}
        tabs={[
          {
            id: "product",
            label: "Product",
            content: <ProductPanel product={product} color={color} size={size} sizeError={sizeError} onColor={(c) => { setColor(c); setSize(null); }} onSize={(s) => { setSize(s); setSizeError(false); }} />,
          },
          { id: "upload", label: "Upload", content: <UploadPanel onUpload={upload} busy={uploading} /> },
          { id: "text", label: "Text", content: <TextPanel selected={api.selectedText} onAdd={api.addText} onChange={api.updateText} /> },
          {
            id: "layers",
            label: "Layers",
            content: <LayersPanel layers={api.layers} onSelect={api.selectLayer} onForward={api.forward} onBackward={api.backward} onRemove={api.removeSelected} />,
          },
        ]}
        footer={
          <AddToCartBar
            price={<PriceSummary basePricePaise={chosen?.pricePaise ?? product.basePricePaise} fees={product.fees} sides={sides} />}
            rights={rights}
            onRights={setRights}
            onAdd={() => void add()}
            busy={busy}
            status={status}
            compact={focus}
          />
        }
      />
    </div>
  );
}
