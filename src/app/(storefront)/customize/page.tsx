import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { ArrowUpRight } from "lucide-react";
import { Reveal } from "@/components/motion";
import { NotifyMe } from "@/components/storefront/notify-me";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import { listStudioProducts } from "@/server/services/designs";

export const metadata: Metadata = {
  title: "Design your own tee",
  description: "Upload artwork or type a line, place it on the front or back, and we print it for you.",
  alternates: { canonical: "/customize" },
};

const STEPS = [
  { n: "01", title: "Pick a blank", body: "Oversized or regular, any color we stock." },
  { n: "02", title: "Drop your design", body: "Upload artwork or type a line. Move it, scale it, front and back." },
  { n: "03", title: "We print and ship", body: "Printed to order in India and at your door in days." },
];

const MAX_DOTS = 6;

export default async function CustomizePage() {
  const products = await listStudioProducts();

  return (
    <div className="container-x py-10" data-testid="customize-page">
      <Reveal>
        <p className="text-xs uppercase tracking-[0.3em] text-brand">Made to order</p>
        <h1 className="mt-2 text-6xl md:text-8xl">Design your own</h1>
        <p className="mt-4 max-w-xl text-lg text-text-muted">Upload artwork or type a line, place it on the front or back, and we print it for you.</p>
      </Reveal>

      {products.length === 0 ? (
        <Reveal delay={0.1} className="mt-10 max-w-xl rounded-md border border-border bg-surface p-6">
          <p className="font-display text-3xl uppercase">The design studio is getting ready</p>
          <p className="mt-2 text-text-muted">Leave your email and we will tell you when it opens.</p>
          <div className="mt-6 space-y-4">
            <NotifyMe />
            <Button render={<Link href="/collections/plain-tees" />} nativeButton={false} variant="secondary" className="h-11 px-4">Shop blank tees</Button>
          </div>
        </Reveal>
      ) : (
        <ul className="mt-10 grid grid-cols-2 gap-4 md:grid-cols-3">
          {products.map((p, i) => (
            <Reveal key={p.slug} as="li" delay={Math.min(i, 5) * 0.08}>
              <Link href={`/customize/${p.slug}`} className="group block min-h-11" data-testid="studio-product-card">
                <div className="relative aspect-[4/5] overflow-hidden rounded-md bg-surface">
                  {p.imageUrl && (
                    <Image src={p.imageUrl} alt="" fill sizes="(min-width: 768px) 33vw, 50vw" className="object-cover motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.03]" />
                  )}
                  <span className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-full bg-brand px-2.5 py-1 font-display text-sm tracking-wide text-brand-ink md:right-3 md:top-3 md:text-base">
                    Customize <ArrowUpRight aria-hidden className="size-3.5" />
                  </span>
                </div>
                <div className="mt-3 space-y-1">
                  <p className="font-display text-xl uppercase leading-tight md:text-2xl">{p.name}</p>
                  <p className="text-sm text-text-muted">from {formatPaise(p.pricePaise)}</p>
                  {p.colors.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pt-1">
                      {p.colors.slice(0, MAX_DOTS).map((c) => (
                        <span key={c.name} title={c.name} aria-hidden className="size-4 rounded-full border border-border" style={{ backgroundColor: c.hex }} />
                      ))}
                      {p.colors.length > MAX_DOTS && <span aria-hidden className="text-xs text-text-muted">+{p.colors.length - MAX_DOTS}</span>}
                      <span className="sr-only">{p.colors.length} colours</span>
                    </div>
                  )}
                </div>
              </Link>
            </Reveal>
          ))}
        </ul>
      )}

      <ol className="mt-20 grid gap-6 md:grid-cols-3">
        {STEPS.map((s, i) => (
          <Reveal key={s.n} as="li" delay={i * 0.1} className="rounded-md border border-border bg-surface p-6">
            <span className="font-display text-4xl text-brand">{s.n}</span>
            <p className="mt-2 font-display text-2xl uppercase">{s.title}</p>
            <p className="mt-1 text-text-muted">{s.body}</p>
          </Reveal>
        ))}
      </ol>
    </div>
  );
}
