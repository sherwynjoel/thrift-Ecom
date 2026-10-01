"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

type FbqWindow = Window & { fbq?: (...args: unknown[]) => void };

/** Meta Pixel PageView on client-side navigations (the init snippet already tracked the first load;
 * GA4's enhanced measurement already records history-based page views, so no GA equivalent is needed here). */
export function PixelPageView() {
  const pathname = usePathname();
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    (window as FbqWindow).fbq?.("track", "PageView");
  }, [pathname]);

  return null;
}
