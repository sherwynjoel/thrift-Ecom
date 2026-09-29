import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/motion";
import { NotifyMe } from "@/components/storefront/notify-me";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Design your own" };

const STEPS = [
  { n: "01", title: "Pick a blank", body: "Oversized or regular, any color we stock." },
  { n: "02", title: "Drop your design", body: "Upload artwork or type a line. Move it, scale it, front and back." },
  { n: "03", title: "We print and ship", body: "Printed to order in India and at your door in days." },
];

export default function CustomizePage() {
  return (
    <div className="container-x py-10" data-testid="customize-page">
      <div className="grid items-center gap-10 lg:grid-cols-2">
        <Reveal>
          <p className="text-xs uppercase tracking-[0.3em] text-text-muted">Coming soon</p>
          <h1 className="mt-2 text-6xl md:text-8xl">Design your own</h1>
          <p className="mt-4 max-w-md text-lg text-text-muted">The design tool is on its way. Leave your email and be first in when it opens, or grab a blank now and we will print your file on request.</p>
          <div className="mt-8 space-y-4">
            <NotifyMe />
            <Button render={<Link href="/collections/plain-tees" />} nativeButton={false} variant="secondary">Shop blank tees</Button>
          </div>
        </Reveal>
        <Reveal delay={0.1}>
          <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-surface">
            <Image src="/seed/tee-beige-front.svg" alt="" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          </div>
        </Reveal>
      </div>
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
