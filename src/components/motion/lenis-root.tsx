"use client";

import { ReactLenis, useLenis } from "lenis/react";
import { useEffect } from "react";
import { ScrollTrigger, gsap } from "./gsap";

function ScrollTriggerSync() {
  const lenis = useLenis(() => ScrollTrigger.update());
  useEffect(() => {
    if (!lenis) return;
    const tick = (time: number) => lenis.raf(time * 1000);
    gsap.ticker.add(tick);
    gsap.ticker.lagSmoothing(0);
    return () => gsap.ticker.remove(tick);
  }, [lenis]);
  return null;
}

/** Smooth scrolling attached to the window. Loaded after first paint so Lenis + GSAP stay out of the initial bundle. */
export default function LenisRoot() {
  return (
    <ReactLenis root options={{ lerp: 0.1, smoothWheel: true, autoRaf: false, allowNestedScroll: true }}>
      <ScrollTriggerSync />
    </ReactLenis>
  );
}
