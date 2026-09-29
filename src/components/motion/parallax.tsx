"use client";

import { useRef, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "./gsap";
import { useReducedMotionSafe } from "./use-reduced-motion";
import { cn } from "@/lib/utils";

export function Parallax({ amount = 40, className, children }: { amount?: number; className?: string; children: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionSafe();

  useGSAP(
    () => {
      if (!ref.current || reduced) return;
      gsap.fromTo(
        ref.current,
        { y: -amount },
        { y: amount, ease: "none", scrollTrigger: { trigger: ref.current, start: "top bottom", end: "bottom top", scrub: true } },
      );
    },
    { dependencies: [reduced, amount], scope: ref },
  );

  return (
    <div ref={ref} className={cn("will-change-transform", className)}>
      {children}
    </div>
  );
}
