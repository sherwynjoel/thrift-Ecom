"use client";

import { motion, useMotionValue, useSpring } from "motion/react";
import type { ComponentProps, PointerEvent } from "react";
import { useReducedMotionSafe } from "./use-reduced-motion";
import { cn } from "@/lib/utils";

type Props = ComponentProps<"button"> & { strength?: number };

export function MagneticButton({ strength = 0.3, className, children, ...rest }: Props) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const sx = useSpring(x, { stiffness: 300, damping: 20 });
  const sy = useSpring(y, { stiffness: 300, damping: 20 });
  const reduced = useReducedMotionSafe();

  const onMove = (e: PointerEvent<HTMLButtonElement>) => {
    // Mouse only: touch and pen have no hover, so tracking would just jolt the button under the finger.
    if (reduced || e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    x.set((e.clientX - (r.left + r.width / 2)) * strength);
    y.set((e.clientY - (r.top + r.height / 2)) * strength);
  };
  const reset = () => {
    x.set(0);
    y.set(0);
  };

  return (
    <motion.button
      {...(rest as ComponentProps<typeof motion.button>)}
      style={{ x: sx, y: sy }}
      onPointerMove={onMove}
      onPointerLeave={reset}
      className={cn("inline-flex items-center justify-center rounded-full bg-brand px-8 py-4 font-display text-xl tracking-wide text-brand-ink transition-colors hover:bg-[#e6ff7a]", className)}
    >
      {children}
    </motion.button>
  );
}
