"use client";

import { useRef, type ElementType, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "./gsap";
import { useReducedMotionSafe } from "./use-reduced-motion";
import { cn } from "@/lib/utils";

interface RevealProps {
  as?: ElementType;
  delay?: number;
  y?: number;
  once?: boolean;
  className?: string;
  children: ReactNode;
}

export function Reveal({ as: Tag = "div", delay = 0, y = 24, once = true, className, children }: RevealProps) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotionSafe();

  useGSAP(
    () => {
      if (!ref.current) return;
      if (reduced) {
        gsap.set(ref.current, { opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)" });
        return;
      }
      gsap.fromTo(
        ref.current,
        { opacity: 0, y, clipPath: "inset(0 0 100% 0)" },
        {
          opacity: 1, y: 0, clipPath: "inset(0 0 0% 0)", duration: 0.9, delay, ease: "power3.out",
          scrollTrigger: { trigger: ref.current, start: "top 85%", once },
        },
      );
    },
    { dependencies: [reduced], scope: ref },
  );

  return (
    <Tag ref={ref} className={cn("will-change-transform", className)} style={{ opacity: reduced ? 1 : 0 }}>
      {children}
    </Tag>
  );
}
