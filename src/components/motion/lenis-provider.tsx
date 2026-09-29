"use client";

import { ReactLenis, useLenis } from "lenis/react";
import { useEffect } from "react";
import { ScrollTrigger, gsap } from "./gsap";
import { useReducedMotionSafe } from "./use-reduced-motion";

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

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotionSafe();
  if (reduced) return <>{children}</>;
  return (
    <ReactLenis root options={{ lerp: 0.1, smoothWheel: true, autoRaf: false }}>
      <ScrollTriggerSync />
      {children}
    </ReactLenis>
  );
}
