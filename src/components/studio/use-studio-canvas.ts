"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Canvas, FabricImage, FabricObject, Textbox } from "fabric";
import { toast } from "sonner";
import { CANVAS_WIDTH, MAX_OBJECTS_PER_SIDE, MAX_TEXT_CHARS, PRINT_AREA, type DesignSide, type StudioFontId } from "@/lib/studio/constants";
import { EMPTY_SIDE, fontIdsIn, isPrintedObject, printedOnly, TEXT_TYPES, toSideJson, withFontFamilies, withImageCors, type SideJson } from "@/lib/studio/canvas-json";
import { canRedo, canUndo, createHistory, pushHistory, redoHistory, undoHistory, type History } from "@/lib/studio/history";
import { objectDpi } from "@/lib/studio/dpi";
import { clampScale } from "@/lib/studio/gesture";
import { loadFabric, loadFontFaces, type FabricModule } from "./fabric-types";
import { usePinch } from "./use-pinch";

export interface LayerInfo { index: number; kind: "text" | "image"; label: string; dpi: number | null; selected: boolean }
export interface SelectedText { text: string; fill: string; fontSize: number; fontId: StudioFontId; bold: boolean; italic: boolean; align: "left" | "center" | "right"; charSpacing: number }
export interface StudioCanvasApi {
  hostRef: React.RefObject<HTMLDivElement | null>; canvasElRef: React.RefObject<HTMLCanvasElement | null>;
  ready: boolean; failed: boolean; retry(): void; side: DesignSide; setSide(s: DesignSide): Promise<void>; counts: Record<DesignSide, number>;
  layers: LayerInfo[]; selectedKind: "text" | "image" | null; selectedText: SelectedText | null; selectedDpi: number | null;
  canUndo: boolean; canRedo: boolean; undo(): Promise<void>; redo(): Promise<void>;
  addText(text: string, fontId: StudioFontId): Promise<void>; updateText(patch: Partial<SelectedText>): Promise<void>;
  addImage(url: string): Promise<void>;
  selectLayer(index: number): void; removeSelected(): void; duplicateSelected(): Promise<void>;
  forward(): void; backward(): void; centerSelected(): void;
  sideJson(s: DesignSide): SideJson;
}

const CENTER = { x: PRINT_AREA.left + PRINT_AREA.width / 2, y: PRINT_AREA.top + PRINT_AREA.height / 2 };
/** Live text edits (typing, sliders) are folded into one undo step once the user pauses. */
const TEXT_COMMIT_DELAY_MS = 350;
const ALIGNS = new Set(["left", "center", "right"]);
const CONTINUOUS_TEXT_KEYS = new Set<string>(["text", "fontSize", "charSpacing", "fill"]);
const BRAND = "#d4ff3f";

const isText = (o: FabricObject): o is Textbox => o.data?.kind === "text" || TEXT_TYPES.has(String(o.type).toLowerCase());
const isImage = (o: FabricObject): o is FabricImage => !isText(o) && String(o.type).toLowerCase() === "image";
/** Empty text layers and layers dragged off the print area stay editable but are not printed (no fee, no file). */
const isPrinted = (o: FabricObject) => isPrintedObject(o as unknown as Record<string, unknown>);
const FULL_MESSAGE = `Use at most ${MAX_OBJECTS_PER_SIDE} layers per side`;
/** Keyboard shortcuts only apply while focus is in the studio (never in the cart drawer or other dialogs). */
export const STUDIO_ROOT_ATTR = "data-studio-root";

function imageDpi(img: FabricImage): number {
  return objectDpi({ naturalWidth: img.width, naturalHeight: img.height, scaledWidth: img.getScaledWidth(), scaledHeight: img.getScaledHeight() });
}

function toHex(fill: unknown, fallback: string): string {
  return typeof fill === "string" && /^#[0-9a-f]{6}$/i.test(fill) ? fill.toLowerCase() : fallback;
}

/** Same-origin uploads serialise as absolute URLs; the server only accepts the storage path, so strip the origin. */
function relativeSources(json: SideJson): SideJson {
  const origin = window.location.origin;
  return {
    ...json,
    objects: json.objects.map((o) => (typeof o.src === "string" && o.src.startsWith(`${origin}/`) ? { ...o, src: o.src.slice(origin.length) } : o)),
  };
}

/** Brand-styled handles, generous on touch. Applied to every object the studio creates or loads (not serialised by the server). */
function styleControls(o: FabricObject): void {
  o.set({
    borderColor: BRAND, borderScaleFactor: 2, cornerColor: "#ffffff", cornerStrokeColor: "#0a0a0a", cornerStyle: "circle",
    cornerSize: 14, touchCornerSize: 36, transparentCorners: false, padding: 6, borderOpacityWhenMoving: 0.6,
  });
}

function sideJsonLength(json: string): number {
  try {
    return toSideJson(JSON.parse(json))?.objects.filter(isPrintedObject).length ?? 0;
  } catch {
    return 0;
  }
}

export function useStudioCanvas({ families, initial, inkHex }: { families: Record<StudioFontId, string>; initial: Record<DesignSide, SideJson>; inkHex: string }): StudioCanvasApi {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const canvasElRef = useRef<HTMLCanvasElement | null>(null);
  const fabricRef = useRef<FabricModule | null>(null);
  const canvasRef = useRef<Canvas | null>(null);
  const sideRef = useRef<DesignSide>("front");
  const restoring = useRef(false);
  const queue = useRef<Promise<unknown>>(Promise.resolve());
  const commitTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Undoes the pinch's temporary locks once the last finger lifts (see usePinch below). */
  const afterPinch = useRef<(() => void) | null>(null);
  const histories = useRef<Record<DesignSide, History<string>>>({
    front: createHistory(JSON.stringify(initial.front)),
    back: createHistory(JSON.stringify(initial.back)),
  });
  const [ready, setReady] = useState(false);
  const [failed, setFailed] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [side, setSideState] = useState<DesignSide>("front");
  const [, setTick] = useState(0); // re-render after canvas changes; every derived value is read from the refs
  const bump = useCallback(() => setTick((t) => t + 1), []);

  const ensureFonts = useCallback((ids: StudioFontId[]) => loadFontFaces(ids, families), [families]);

  const serialize = useCallback((): SideJson => {
    const c = canvasRef.current;
    if (!c) return EMPTY_SIDE;
    return relativeSources(toSideJson(c.toObject(["data"])) ?? EMPTY_SIDE);
  }, []);

  const commit = useCallback(() => {
    if (commitTimer.current) {
      clearTimeout(commitTimer.current);
      commitTimer.current = null;
    }
    if (restoring.current || !canvasRef.current) return;
    const s = sideRef.current;
    histories.current[s] = pushHistory(histories.current[s], JSON.stringify(serialize()));
    bump();
  }, [bump, serialize]);

  const commitSoon = useCallback(() => {
    if (commitTimer.current) clearTimeout(commitTimer.current);
    commitTimer.current = setTimeout(commit, TEXT_COMMIT_DELAY_MS);
    bump();
  }, [bump, commit]);

  /** Commits a pending (debounced) text edit now, so undo, side switches and exports never lose it. */
  const flush = useCallback(() => {
    // Typing on the canvas only commits when editing ends (object:modified), and a click outside the canvas never ends it.
    const active = canvasRef.current?.getActiveObject();
    if (active && isText(active) && active.isEditing) active.exitEditing();
    if (commitTimer.current) commit();
  }, [commit]);

  const clip = useCallback(() => {
    const c = canvasRef.current, f = fabricRef.current;
    if (c && f) c.clipPath = new f.Rect({ ...PRINT_AREA, absolutePositioned: true });
  }, []);

  /** Loads are serialised: a second undo tap waits for the first load instead of racing it. */
  const load = useCallback((json: string, keepSelection = false): Promise<void> => {
    const run = async () => {
      const c = canvasRef.current;
      if (!c) return;
      restoring.current = true;
      try {
        const parsed = toSideJson(JSON.parse(json)) ?? EMPTY_SIDE;
        await ensureFonts(fontIdsIn(parsed));
        const active = c.getActiveObject();
        const selected = keepSelection && active ? c.getObjects().indexOf(active) : -1;
        c.discardActiveObject();
        await c.loadFromJSON(withImageCors(withFontFamilies(parsed, families)));
        c.getObjects().forEach(styleControls);
        clip(); // loadFromJSON resets canvas.clipPath
        // Undo/redo keep the same layer selected (when it still exists) so the text controls stay open.
        const again = selected >= 0 ? c.getObjects()[selected] : undefined;
        if (again) c.setActiveObject(again);
        c.requestRenderAll();
      } catch (err) {
        console.error("[studio] could not load the design", err);
      } finally {
        restoring.current = false;
        bump();
      }
    };
    const next = queue.current.then(run, run);
    queue.current = next;
    return next;
  }, [bump, clip, ensureFonts, families]);

  // Init once: dynamic import, canvas, clip, resize, events, first side.
  useEffect(() => {
    let disposed = false;
    let observer: ResizeObserver | null = null;
    let onTouchStart: ((e: TouchEvent) => void) | null = null;
    const host = hostRef.current;
    setFailed(false);
    (async () => {
      const f = await loadFabric();
      if (disposed || !canvasElRef.current || !hostRef.current) return;
      fabricRef.current = f;
      const c = new f.Canvas(canvasElRef.current, {
        // True at construction: Fabric bakes the canvas touch-action CSS here (false would mean "none", so no swipe could scroll).
        // Toggled per touch below: swipes on empty stage scroll the page, touches on a layer drag it.
        preserveObjectStacking: true, controlsAboveOverlay: true, allowTouchScrolling: true,
        selectionColor: "rgba(212,255,63,0.12)", selectionBorderColor: BRAND, selectionLineWidth: 1.5,
      });
      canvasRef.current = c;
      clip();
      const fit = () => {
        const w = hostRef.current?.clientWidth ?? 0;
        if (!w) return;
        c.setDimensions({ width: w, height: Math.round(w * 1.25) });
        c.setZoom(w / CANVAS_WIDTH);
        c.requestRenderAll();
      };
      fit();
      observer = new ResizeObserver(fit);
      observer.observe(hostRef.current);
      for (const ev of ["object:added", "object:removed", "object:modified"] as const) c.on(ev, commit);
      for (const ev of ["selection:created", "selection:updated", "selection:cleared", "object:scaling", "text:changed"] as const) c.on(ev, bump);
      // Fabric decides on touchstart whether a gesture scrolls the page or edits (it only tracks the moves of an editing touch),
      // so decide just before it, in the capture phase: a touch on a layer or handle edits; a swipe on empty stage scrolls.
      // A second finger always belongs to the editor (pinch).
      onTouchStart = (e: TouchEvent) => {
        c.allowTouchScrolling = e.touches.length === 1 && !c.findTarget(e);
      };
      hostRef.current.addEventListener("touchstart", onTouchStart, { capture: true, passive: true });
      // Fabric sees the lift of the first pinch finger as a tap; release the pinch locks only after it handled that.
      c.on("mouse:up", () => {
        const release = afterPinch.current;
        if (!release) return;
        afterPinch.current = null;
        setTimeout(release, 0);
      });
      await load(histories.current[sideRef.current].present);
      if (!disposed) setReady(true);
    })().catch((err: unknown) => {
      console.error("[studio] editor failed to start", err);
      if (!disposed) setFailed(true);
    });
    return () => {
      disposed = true;
      observer?.disconnect();
      if (onTouchStart) host?.removeEventListener("touchstart", onTouchStart, { capture: true });
      if (commitTimer.current) clearTimeout(commitTimer.current);
      const c = canvasRef.current;
      canvasRef.current = null;
      void c?.dispose();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initialise once per mount (and again on retry)
  }, [attempt]);

  const retry = useCallback(() => setAttempt((a) => a + 1), []);

  const setSide = useCallback(async (s: DesignSide) => {
    if (s === sideRef.current) return;
    flush();
    sideRef.current = s;
    setSideState(s);
    await load(histories.current[s].present);
  }, [flush, load]);

  const undo = useCallback(async () => {
    flush();
    const s = sideRef.current;
    if (!canUndo(histories.current[s])) return;
    histories.current[s] = undoHistory(histories.current[s]);
    await load(histories.current[s].present, true);
  }, [flush, load]);

  const redo = useCallback(async () => {
    flush();
    const s = sideRef.current;
    if (!canRedo(histories.current[s])) return;
    histories.current[s] = redoHistory(histories.current[s]);
    await load(histories.current[s].present, true);
  }, [flush, load]);

  const full = useCallback(() => {
    const isFull = (canvasRef.current?.getObjects().length ?? 0) >= MAX_OBJECTS_PER_SIDE;
    if (isFull) toast.error(FULL_MESSAGE);
    return isFull;
  }, []);

  const addToCanvas = useCallback((obj: FabricObject) => {
    const c = canvasRef.current, f = fabricRef.current;
    if (!c || !f) return;
    flush();
    styleControls(obj);
    obj.setPositionByOrigin(new f.Point(CENTER.x, CENTER.y), "center", "center");
    obj.setCoords();
    c.add(obj); // fires object:added → commit
    c.setActiveObject(obj);
    c.requestRenderAll();
    bump();
  }, [bump, flush]);

  const addText = useCallback(async (text: string, fontId: StudioFontId) => {
    const f = fabricRef.current;
    if (!f || !text.trim() || full()) return;
    await ensureFonts([fontId]);
    const t = new f.Textbox(text.trim().slice(0, MAX_TEXT_CHARS), {
      fontFamily: families[fontId], fontSize: 56, fill: inkHex, textAlign: "center", width: PRINT_AREA.width * 0.9,
      splitByGrapheme: false, fontWeight: "normal", fontStyle: "normal", charSpacing: 0,
    });
    t.data = { kind: "text", fontId };
    addToCanvas(t);
  }, [addToCanvas, ensureFonts, families, full, inkHex]);

  const addImage = useCallback(async (url: string) => {
    const f = fabricRef.current;
    if (!f || full()) return;
    let img: FabricImage;
    try {
      img = await f.FabricImage.fromURL(url, { crossOrigin: "anonymous" });
    } catch (err) {
      console.error("[studio] image load failed", err);
      throw new Error("Could not load that image. Please try again.");
    }
    img.data = { kind: "image" };
    img.scale(Math.min((PRINT_AREA.width * 0.8) / img.width, (PRINT_AREA.height * 0.8) / img.height));
    addToCanvas(img);
  }, [addToCanvas, full]);

  const updateText = useCallback(async (patch: Partial<SelectedText>) => {
    const c = canvasRef.current;
    const t = c?.getActiveObject();
    if (!c || !t || !isText(t)) return;
    // Typing, sliders and the colour picker fire continuously and are folded into one step; toggles and selects are one step each.
    const continuous = Object.keys(patch).every((k) => CONTINUOUS_TEXT_KEYS.has(k));
    if (!continuous) flush();
    const props: Record<string, unknown> = {};
    if (patch.text !== undefined) props.text = patch.text.slice(0, MAX_TEXT_CHARS);
    if (patch.fill !== undefined) props.fill = toHex(patch.fill, inkHex);
    if (patch.fontSize !== undefined) props.fontSize = patch.fontSize;
    if (patch.bold !== undefined) props.fontWeight = patch.bold ? "bold" : "normal";
    if (patch.italic !== undefined) props.fontStyle = patch.italic ? "italic" : "normal";
    if (patch.align !== undefined) props.textAlign = patch.align;
    if (patch.charSpacing !== undefined) props.charSpacing = patch.charSpacing;
    if (patch.fontId !== undefined) {
      await ensureFonts([patch.fontId]);
      props.fontFamily = families[patch.fontId];
      t.data = { kind: "text", fontId: patch.fontId };
    }
    t.set(props);
    t.initDimensions();
    t.setCoords();
    c.requestRenderAll();
    if (continuous) commitSoon(); // set() fires no event
    else commit();
  }, [commit, commitSoon, ensureFonts, families, flush, inkHex]);

  const selectLayer = useCallback((index: number) => {
    const c = canvasRef.current;
    const o = c?.getObjects()[index];
    if (!c || !o) return;
    c.setActiveObject(o);
    c.requestRenderAll();
    bump();
  }, [bump]);

  const removeSelected = useCallback(() => {
    const c = canvasRef.current;
    if (!c) return;
    const active = c.getActiveObjects();
    if (active.length === 0) return;
    flush();
    c.discardActiveObject();
    restoring.current = true; // object:removed fires per object: commit once for the whole selection instead
    try {
      c.remove(...active);
    } finally {
      restoring.current = false;
    }
    c.requestRenderAll();
    commit();
  }, [commit, flush]);

  const duplicateSelected = useCallback(async () => {
    const c = canvasRef.current;
    const active = c?.getActiveObject();
    if (!c || !active || full()) return;
    flush();
    const copy = await active.clone(["data"]);
    styleControls(copy);
    copy.set({ left: active.left + 20, top: active.top + 20 });
    copy.setCoords();
    c.add(copy);
    c.setActiveObject(copy);
    c.requestRenderAll();
    bump();
  }, [bump, flush, full]);

  const restack = useCallback((dir: "forward" | "backward") => {
    const c = canvasRef.current;
    const active = c?.getActiveObject();
    if (!c || !active) return;
    flush();
    if (dir === "forward") c.bringObjectForward(active);
    else c.sendObjectBackwards(active);
    c.requestRenderAll();
    commit();
  }, [commit, flush]);
  const forward = useCallback(() => restack("forward"), [restack]);
  const backward = useCallback(() => restack("backward"), [restack]);

  const centerSelected = useCallback(() => {
    const c = canvasRef.current, f = fabricRef.current;
    const active = c?.getActiveObject();
    if (!c || !f || !active) return;
    flush();
    active.setPositionByOrigin(new f.Point(CENTER.x, CENTER.y), "center", "center");
    active.setCoords();
    c.requestRenderAll();
    commit();
  }, [commit, flush]);

  const sideJson = useCallback((s: DesignSide): SideJson => {
    flush();
    try {
      return printedOnly(toSideJson(JSON.parse(histories.current[s].present)) ?? EMPTY_SIDE);
    } catch {
      return EMPTY_SIDE;
    }
  }, [flush]);

  // Two-finger pinch scales and rotates the selected layer around its centre; one history step on release.
  usePinch(hostRef, () => {
    const c = canvasRef.current;
    const o = c?.getActiveObject();
    if (!c || !o) return null;
    const snapshot = () => ({
      scaleX: o.scaleX, scaleY: o.scaleY, angle: o.angle, center: o.getCenterPoint(),
      lockX: o.lockMovementX, lockY: o.lockMovementY, editable: isText(o) ? o.editable : false,
    });
    let start = snapshot();
    const recenter = () => {
      o.setPositionByOrigin(start.center, "center", "center");
      o.setCoords();
      c.requestRenderAll();
    };
    return {
      begin() {
        start = snapshot();
        o.set({ lockMovementX: true, lockMovementY: true }); // the first finger must not drag while pinching
        if (isText(o)) {
          if (o.isEditing) o.exitEditing();
          o.editable = false; // ...and its lift must not open in-place editing (and the phone keyboard)
        }
        afterPinch.current = () => {
          o.set({ lockMovementX: start.lockX, lockMovementY: start.lockY });
          if (isText(o)) o.editable = start.editable;
        };
      },
      scale(s) {
        o.set({ scaleX: clampScale(start.scaleX * s), scaleY: clampScale(start.scaleY * s) });
        recenter();
        if (isImage(o)) bump(); // live DPI chip
      },
      rotate(deg) {
        o.rotate(start.angle + deg);
        recenter();
      },
      end() {
        o.setCoords();
        commit();
      },
    };
  });

  // Keyboard: Delete/Backspace removes, Ctrl/Cmd+Z undoes, Ctrl/Cmd+Shift+Z or Ctrl+Y redoes.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const c = canvasRef.current;
      if (!c) return;
      const target = e.target as HTMLElement | null;
      if (target && (target.isContentEditable || ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))) return;
      // Focus on the page body counts as the studio; focus anywhere else (cart drawer, dialogs, header) does not.
      if (target && target !== document.body && (target.closest('[role="dialog"]') || !target.closest(`[${STUDIO_ROOT_ATTR}]`))) return;
      if ((c.getActiveObject() as Textbox | undefined)?.isEditing) return;
      const mod = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();
      if (mod && key === "z" && !e.shiftKey) {
        e.preventDefault();
        void undo();
      } else if (mod && ((key === "z" && e.shiftKey) || key === "y")) {
        e.preventDefault();
        void redo();
      } else if (!mod && (e.key === "Delete" || e.key === "Backspace") && c.getActiveObjects().length > 0) {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [redo, removeSelected, undo]);

  // Everything below is derived from the canvas on each render; no Fabric object lives in React state.
  const c = ready ? canvasRef.current : null;
  const objects = c?.getObjects() ?? [];
  const activeObjects = c?.getActiveObjects() ?? [];
  const active = activeObjects.length === 1 ? activeObjects[0] : null;
  const other: DesignSide = side === "front" ? "back" : "front";
  const liveCount = c ? objects.filter(isPrinted).length : sideJsonLength(histories.current[side].present);
  const counts = { [side]: liveCount, [other]: sideJsonLength(histories.current[other].present) } as Record<DesignSide, number>;
  const layers: LayerInfo[] = objects
    .map((o, index) => ({
      index,
      kind: isText(o) ? ("text" as const) : ("image" as const),
      label: isText(o) ? (o.text?.trim() || "Empty text").slice(0, 24) : "Image",
      dpi: isImage(o) ? imageDpi(o) : null,
      selected: activeObjects.includes(o),
    }))
    .reverse();
  const selectedText: SelectedText | null =
    active && isText(active)
      ? {
          text: active.text ?? "",
          fill: toHex(active.fill, inkHex),
          fontSize: active.fontSize,
          fontId: active.data?.fontId ?? "anton",
          bold: active.fontWeight === "bold" || Number(active.fontWeight) >= 700,
          italic: active.fontStyle === "italic",
          align: ALIGNS.has(active.textAlign) ? (active.textAlign as SelectedText["align"]) : "center",
          charSpacing: active.charSpacing ?? 0,
        }
      : null;
  const history = histories.current[side];

  return {
    hostRef, canvasElRef, ready, failed, retry, side, setSide, counts, layers,
    selectedKind: active ? (isText(active) ? "text" : "image") : null,
    selectedText,
    selectedDpi: active && isImage(active) ? imageDpi(active) : null,
    canUndo: ready && (canUndo(history) || commitTimer.current !== null),
    canRedo: ready && canRedo(history),
    undo, redo, addText, updateText, addImage, selectLayer, removeSelected, duplicateSelected, forward, backward, centerSelected, sideJson,
  };
}
