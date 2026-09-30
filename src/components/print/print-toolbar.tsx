"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

export function PrintToolbar({ backHref, backLabel = "Back", autoPrint = false }: { backHref: string; backLabel?: string; autoPrint?: boolean }) {
  useEffect(() => {
    // Skip in automated browsers so e2e runs never block on the print dialog.
    if (!autoPrint || navigator.webdriver) return;
    const t = window.setTimeout(() => window.print(), 400);
    return () => window.clearTimeout(t);
  }, [autoPrint]);
  return (
    <div className="no-print sticky top-0 z-10 flex flex-wrap items-center gap-3 border-b border-border bg-bg p-3 print:hidden" data-testid="print-toolbar">
      <Link href={backHref} className="inline-flex min-h-11 items-center px-2 text-sm text-text-muted hover:text-text">← {backLabel}</Link>
      <Button onClick={() => window.print()} className="ml-auto h-11 px-5"><Printer className="size-4" /> Print</Button>
    </div>
  );
}
