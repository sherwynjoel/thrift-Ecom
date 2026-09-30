import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatTile({ label, value, href, tone = "default", hint, size = "lg" }: {
  label: string;
  value: number | string;
  href?: string;
  tone?: "default" | "warn";
  /** A sub-label under the value, e.g. "3 orders". */
  hint?: string;
  /** "sm" for secondary rows (catalog counts) under the headline tiles. */
  size?: "lg" | "sm";
}) {
  const warn = tone === "warn" && Number(value) > 0;
  const body = (
    <div className={cn("h-full rounded-md border bg-surface", size === "lg" ? "p-4 sm:p-5" : "p-4", warn ? "border-danger/60" : "border-border")}>
      <p className="text-xs uppercase tracking-widest text-text-muted">{label}</p>
      <p className={cn("mt-2 font-display tabular-nums [overflow-wrap:anywhere]", size === "lg" ? "text-3xl sm:text-5xl" : "text-3xl", warn && "text-danger")}>{value}</p>
      {hint && <p className="mt-1 text-xs text-text-muted">{hint}</p>}
    </div>
  );
  return href ? <Link href={href} className="block h-full transition-opacity hover:opacity-90">{body}</Link> : body;
}
