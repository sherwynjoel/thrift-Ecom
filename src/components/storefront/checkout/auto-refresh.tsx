"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";

/**
 * Re-renders the server page every `intervalMs` (up to `maxTries` times) while a payment is being
 * confirmed, showing `children` (e.g. a spinner and "this takes a few seconds" copy) meanwhile. Once
 * it gives up, `children` is replaced by `fallback` (e.g. "still waiting?" copy) plus a "Check again"
 * button that runs another round — so the page never ends up showing a spinner that stopped meaning
 * anything alongside fallback copy that contradicts it.
 */
export function AutoRefresh({ intervalMs = 3000, maxTries = 10, children, fallback }: { intervalMs?: number; maxTries?: number; children?: React.ReactNode; fallback?: React.ReactNode }) {
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

  if (!exhausted) return <>{children}</>;
  if (fallback === undefined) return null;
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
