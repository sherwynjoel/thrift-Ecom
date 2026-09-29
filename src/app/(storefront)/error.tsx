"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function StorefrontError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="container-x flex min-h-[60dvh] flex-col items-start justify-center gap-4">
      <h1 className="text-4xl">Something broke</h1>
      <p className="text-text-muted">We logged it. Try again, and if it keeps happening, tell us.{error.digest ? ` Ref ${error.digest}.` : ""}</p>
      <Button onClick={reset}>Try again</Button>
    </div>
  );
}
