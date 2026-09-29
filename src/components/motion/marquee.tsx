"use client";

import type { ReactNode } from "react";
import { useReducedMotionSafe } from "./use-reduced-motion";
import { cn } from "@/lib/utils";

interface MarqueeProps {
  speed?: number;
  pauseOnHover?: boolean;
  className?: string;
  children: ReactNode;
}

export function Marquee({ speed = 30, pauseOnHover = true, className, children }: MarqueeProps) {
  const reduced = useReducedMotionSafe();
  if (reduced) {
    return (
      <div className={cn("overflow-x-auto whitespace-nowrap", className)} aria-live="off">
        <div className="inline-flex items-center gap-8 px-4">{children}</div>
      </div>
    );
  }
  return (
    <div className={cn("group overflow-hidden whitespace-nowrap", className)} style={{ "--marquee-duration": `${speed}s` } as React.CSSProperties}>
      <div className={cn("inline-flex w-max animate-marquee items-center", pauseOnHover && "group-hover:[animation-play-state:paused]")}>
        <div className="inline-flex items-center gap-8 px-4">{children}</div>
        <div className="inline-flex items-center gap-8 px-4" aria-hidden="true">{children}</div>
      </div>
    </div>
  );
}
