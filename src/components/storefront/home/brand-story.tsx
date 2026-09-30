import Image from "next/image";
import { Parallax, Reveal } from "@/components/motion";
import { BRAND } from "@/config/brand";

export function BrandStory() {
  return (
    <section className="container-x grid items-center gap-10 border-t border-border py-20 lg:grid-cols-[1fr_1.2fr]" data-testid="brand-story">
      <Parallax amount={40} className="relative aspect-square overflow-hidden rounded-sm bg-surface">
        <Image src="/seed/tee-black-back.svg" alt="" fill sizes="(min-width: 1024px) 40vw, 100vw" className="object-cover" />
      </Parallax>
      <Reveal>
        <h2 className="text-5xl md:text-7xl">{BRAND.name} is loud on purpose</h2>
        <p className="mt-6 max-w-lg text-lg text-text-muted">We cut heavyweight cotton in a boxy fit, print in small runs, and keep the prices where a college kid can reach them. Every design is made in India and every order is packed by hand.</p>
        <p className="mt-4 max-w-lg text-lg text-text-muted">If a tee gets you a compliment, you owe us a photo.</p>
      </Reveal>
    </section>
  );
}
