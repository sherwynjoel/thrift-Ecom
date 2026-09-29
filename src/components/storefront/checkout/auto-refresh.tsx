"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Re-renders the server page every `intervalMs` (up to `maxTries` times) while a payment is being confirmed. */
export function AutoRefresh({ intervalMs = 3000, maxTries = 10 }: { intervalMs?: number; maxTries?: number }) {
  const router = useRouter();
  useEffect(() => {
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      router.refresh();
      if (tries >= maxTries) window.clearInterval(id);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs, maxTries]);
  return null;
}
