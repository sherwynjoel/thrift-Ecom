"use client";

import { AlertTriangle } from "lucide-react";
import { dpiLevel, dpiMessage } from "@/lib/studio/dpi";
import { cn } from "@/lib/utils";

/** Print-quality warning for an image layer. Informational only: it never blocks adding to the bag. Not a live region (the studio announces one summary). */
export function DpiChip({ dpi, className }: { dpi: number | null; className?: string }) {
  if (dpi === null || !Number.isFinite(dpi)) return null;
  const level = dpiLevel(dpi);
  if (level === "ok") return null;
  return (
    <span
      data-testid="dpi-warning"
      data-level={level}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium leading-tight",
        level === "blurry" ? "bg-red-100 text-red-900" : "bg-amber-100 text-amber-900",
        className,
      )}
    >
      <AlertTriangle aria-hidden className="size-3.5 shrink-0" />
      {dpiMessage(level)} ({dpi} DPI)
    </span>
  );
}
