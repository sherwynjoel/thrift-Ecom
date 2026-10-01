"use client";

import { useEffect } from "react";
import { track, type AnalyticsEvent } from "@/lib/analytics";

/** Fires one analytics event on mount. With onceKey it fires at most once per browser session (e.g. purchase on reload). */
export function TrackEvent({ event, onceKey }: { event: AnalyticsEvent; onceKey?: string }) {
  const signature = onceKey ?? JSON.stringify(event);
  useEffect(() => {
    if (onceKey) {
      try {
        if (sessionStorage.getItem(onceKey)) return;
        sessionStorage.setItem(onceKey, "1");
      } catch {
        // storage blocked: still send once for this mount
      }
    }
    track(event);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire once per distinct event
  }, [signature]);
  return null;
}
