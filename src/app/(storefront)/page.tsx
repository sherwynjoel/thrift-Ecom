import { BRAND } from "@/config/brand";

export default function Home() {
  return (
    <section className="container-x flex min-h-dvh flex-col items-start justify-center gap-6 py-24">
      <h1 className="text-[16vw] leading-[0.85] sm:text-[12vw]">{BRAND.name}</h1>
      <p className="max-w-md text-lg text-text-muted">{BRAND.tagline}</p>
      <span className="rounded-full bg-brand px-4 py-2 font-display text-lg text-brand-ink">Storefront under construction</span>
    </section>
  );
}
