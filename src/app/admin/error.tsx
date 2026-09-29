"use client";

import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function AdminError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return (
    <div className="py-20">
      <h1 className="text-4xl">Something broke</h1>
      <p className="mt-2 text-text-muted">We logged it. Try again, and if it keeps happening, tell us.{error.digest ? ` Ref ${error.digest}.` : ""}</p>
      <Button onClick={reset} className="mt-4">Try again</Button>
    </div>
  );
}
