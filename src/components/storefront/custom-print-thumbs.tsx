/* eslint-disable @next/next/no-img-element -- previews come from our storage at a fixed 800 × 1000 size; used in order and print views */
import { cn } from "@/lib/utils";

/** "Front" / "Back" captioned previews of a custom print. Server-safe (no hooks); renders nothing without previews. */
export function CustomPrintThumbs({ front, back, size = 64, className }: { front: string | null; back: string | null; size?: number; className?: string }) {
  const shots: { label: string; url: string }[] = [];
  if (front) shots.push({ label: "Front", url: front });
  if (back) shots.push({ label: "Back", url: back });
  if (shots.length === 0) return null;
  return (
    <div className={cn("flex gap-2", className)} data-testid="custom-print-thumbs">
      {shots.map(({ label, url }) => (
        <figure key={label} className="text-center">
          <img src={url} alt={`${label} of your custom tee`} width={size} height={Math.round(size * 1.25)} className="rounded-sm border border-border bg-surface object-cover" loading="lazy" />
          <figcaption className="mt-0.5 text-[10px] uppercase tracking-wide text-text-muted">{label}</figcaption>
        </figure>
      ))}
    </div>
  );
}
