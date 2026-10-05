"use client";

import dynamic from "next/dynamic";
import { useReducedMotionSafe } from "./use-reduced-motion";

// Lenis (root mode) attaches to the window, so it doesn't need to wrap the page: rendering it as a
// lazily loaded sibling keeps it and GSAP out of every storefront page's first-load JavaScript.
const LenisRoot = dynamic(() => import("./lenis-root"), { ssr: false });

export function LenisProvider({ children }: { children: React.ReactNode }) {
  const reduced = useReducedMotionSafe();
  return (
    <>
      {children}
      {!reduced && <LenisRoot />}
    </>
  );
}
