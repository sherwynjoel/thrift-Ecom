"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useGSAP } from "@gsap/react";
import { ScrollTrigger, gsap } from "./gsap";
import { useReducedMotionSafe } from "./use-reduced-motion";
import { cn } from "@/lib/utils";

/** Pins the section and scrolls its track horizontally while the user scrolls vertically (fine pointers, >= 1024px). */
export function PinnedStrip({ className, trackClassName, children }: { className?: string; trackClassName?: string; children: ReactNode }) {
  const section = useRef<HTMLDivElement>(null);
  const track = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotionSafe();
  const [pinned, setPinned] = useState(false);

  useGSAP(
    () => {
      if (!section.current || !track.current || reduced) return;
      const mm = gsap.matchMedia();
      mm.add("(min-width: 1024px) and (pointer: fine)", () => {
        setPinned(true);
        const distance = () => track.current!.scrollWidth - section.current!.clientWidth;
        const tween = gsap.to(track.current, {
          x: () => -distance(),
          ease: "none",
          scrollTrigger: {
            trigger: section.current,
            start: "top top",
            end: () => `+=${distance()}`,
            pin: true,
            scrub: 1,
            invalidateOnRefresh: true,
            anticipatePin: 1,
          },
        });
        return () => {
          tween.scrollTrigger?.kill();
          tween.kill();
          setPinned(false);
        };
      });
      ScrollTrigger.refresh();
      return () => mm.revert();
    },
    { dependencies: [reduced], scope: section },
  );

  useEffect(() => {
    if (pinned) ScrollTrigger.refresh();
  }, [pinned]);

  return (
    <div ref={section} className={cn(pinned && "overflow-hidden", className)} data-pinned={pinned || undefined}>
      <div
        ref={track}
        className={cn(
          "flex gap-6",
          pinned ? "w-max" : "w-full snap-x snap-mandatory overflow-x-auto pb-4",
          trackClassName,
        )}
      >
        {children}
      </div>
    </div>
  );
}
