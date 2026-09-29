import Link from "next/link";
import { cn } from "@/lib/utils";

export function StatTile({ label, value, href, tone = "default" }: { label: string; value: number | string; href?: string; tone?: "default" | "warn" }) {
  const body = (
    <div className={cn("rounded-md border bg-surface p-5", tone === "warn" && Number(value) > 0 ? "border-danger/60" : "border-border")}>
      <p className="text-xs uppercase tracking-widest text-text-muted">{label}</p>
      <p className={cn("mt-2 font-display text-5xl", tone === "warn" && Number(value) > 0 && "text-danger")}>{value}</p>
    </div>
  );
  return href ? <Link href={href} className="block transition-opacity hover:opacity-90">{body}</Link> : body;
}
