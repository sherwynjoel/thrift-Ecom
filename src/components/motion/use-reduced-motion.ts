"use client";

import { useReducedMotion } from "motion/react";

/** true when the OS asks for reduced motion; false during SSR so markup matches. */
export function useReducedMotionSafe(): boolean {
  return useReducedMotion() ?? false;
}
