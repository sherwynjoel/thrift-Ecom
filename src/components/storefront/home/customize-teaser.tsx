import Image from "next/image";
import Link from "next/link";
import { Reveal } from "@/components/motion";
import { Button } from "@/components/ui/button";

export function CustomizeTeaser() {
  return (
    <section className="container-x grid items-center gap-10 py-20 lg:grid-cols-2" data-testid="customize-teaser">
      <Reveal>
        <div className="relative aspect-[4/5] overflow-hidden rounded-sm bg-surface">
          <Image src="/seed/tee-white-front.svg" alt="Blank white tee ready for your design" fill sizes="(min-width: 1024px) 50vw, 100vw" className="object-cover" />
          <div className="absolute left-1/2 top-[36%] w-[30%] -translate-x-1/2 rounded-sm border-2 border-dashed border-brand/70 bg-brand/10 p-3 text-center font-display text-lg uppercase text-brand">Your design here</div>
        </div>
      </Reveal>
      <Reveal delay={0.1}>
        <p className="text-xs uppercase tracking-[0.3em] text-text-muted">Made to order</p>
        <h2 className="mt-2 text-5xl md:text-7xl">Print your own</h2>
        <p className="mt-4 max-w-md text-lg text-text-muted">Upload artwork or type a line, drop it on a blank tee, see it live, and we print and ship it. Front, back, any color we stock.</p>
        <Button render={<Link href="/customize" />} nativeButton={false} size="lg" className="mt-8 font-display text-lg tracking-wide">Start designing</Button>
      </Reveal>
    </section>
  );
}
