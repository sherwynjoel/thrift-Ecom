"use client";

import { useEffect, useRef } from "react";
import { pinchTransform, type Pt } from "@/lib/studio/gesture";

/** What a two-finger gesture drives: scale/rotate are relative to the values recorded by begin(). */
export interface PinchTarget { scale(s: number): void; rotate(deg: number): void; begin(): void; end(): void }

/**
 * Two-finger pinch/rotate on the active object. One finger stays with Fabric (drag, select, handles);
 * the stage has `touch-action: none`, so the browser never turns the gesture into page zoom or scroll.
 */
export function usePinch(hostRef: React.RefObject<HTMLElement | null>, target: () => PinchTarget | null): void {
  const targetRef = useRef(target);
  targetRef.current = target;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    const pointers = new Map<number, Pt>();
    let active: { t: PinchTarget; a: number; b: number; a0: Pt; b0: Pt } | null = null;

    const finish = () => {
      if (!active) return;
      const t = active.t;
      active = null;
      t.end();
    };
    const down = (e: PointerEvent) => {
      if (e.pointerType !== "touch") return;
      if (pointers.size >= 2) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (pointers.size === 2 && !active) {
        const t = targetRef.current();
        if (!t) return;
        const [[a, a0], [b, b0]] = [...pointers.entries()];
        active = { t, a, b, a0, b0 };
        t.begin();
      }
    };
    const move = (e: PointerEvent) => {
      if (!pointers.has(e.pointerId)) return;
      pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      if (!active) return;
      const a1 = pointers.get(active.a);
      const b1 = pointers.get(active.b);
      if (!a1 || !b1) return;
      const { scale, rotateDeg } = pinchTransform(active.a0, active.b0, a1, b1);
      active.t.scale(scale);
      active.t.rotate(rotateDeg);
    };
    const up = (e: PointerEvent) => {
      if (!pointers.delete(e.pointerId)) return;
      if (active && (e.pointerId === active.a || e.pointerId === active.b)) finish();
    };

    const opts = { passive: true } as const;
    host.addEventListener("pointerdown", down, opts);
    // Fabric listens on the document while a finger is down, so moves/ups are tracked there too.
    window.addEventListener("pointermove", move, opts);
    window.addEventListener("pointerup", up, opts);
    window.addEventListener("pointercancel", up, opts);
    return () => {
      finish();
      host.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
  }, [hostRef]);
}
