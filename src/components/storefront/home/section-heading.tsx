import Link from "next/link";
import { ArrowUpRight } from "lucide-react";

export function SectionHeading({ eyebrow, title, href, cta = "View all" }: { eyebrow?: string; title: string; href?: string; cta?: string }) {
  return (
    <div className="mb-8 flex items-end justify-between gap-4">
      <div>
        {eyebrow && <p className="mb-1 text-xs uppercase tracking-[0.3em] text-text-muted">{eyebrow}</p>}
        <h2 className="text-5xl md:text-7xl">{title}</h2>
      </div>
      {href && (
        <Link href={href} className="hidden items-center gap-1 text-sm uppercase tracking-wide text-text-muted hover:text-text sm:inline-flex">{cta}<ArrowUpRight className="size-4" /></Link>
      )}
    </div>
  );
}
