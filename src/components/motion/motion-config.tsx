"use client";

import { MotionConfig } from "motion/react";

/**
 * Client wrapper around motion's `MotionConfig` so a server component layout can honour
 * the user's OS reduced-motion preference for every `motion.*` animation beneath it.
 */
export function ReducedMotionConfig({ children }: { children: React.ReactNode }) {
  return <MotionConfig reducedMotion="user">{children}</MotionConfig>;
}
