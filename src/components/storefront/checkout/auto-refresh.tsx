"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Re-renders the server page every `intervalMs` (up to `maxTries` times) while a payment is being
 * confirmed. Once it gives up it renders `fallback` (e.g. Retry payment) plus a "Check again" button
 * that runs another round, so the page never ends as a spinner with no way forward.
 */
export function AutoRefresh({ intervalMs = 3000, maxTries = 10, fallback }: { intervalMs?: number; maxTries?: number; fallback?: React.ReactNode }) {
  const router = useRouter();
  const [round, setRound] = useState(0);
  const [exhausted, setExhausted] = useState(false);

  useEffect(() => {
    let tries = 0;
    const id = window.setInterval(() => {
      tries += 1;
      router.refresh();
      if (tries >= maxTries) {
        window.clearInterval(id);
        setExhausted(true);
      }
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [router, intervalMs, maxTries, round]);

  if (!exhausted || fallback === undefined) return null;
  return (
    <div className="space-y-3" data-testid="confirming-fallback">
      {fallback}
      <Button
        type="button"
        variant="ghost"
        className="h-11 w-full px-6 sm:w-auto"
        onClick={() => {
          setExhausted(false);
          setRound((r) => r + 1);
          router.refresh();
        }}
      >
        Check again
      </Button>
    </div>
  );
}
