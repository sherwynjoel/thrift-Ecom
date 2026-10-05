"use client";

import { getImageProps } from "next/image";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { useReducedMotionSafe } from "@/components/motion";
import { isExternalHref, isSafeHref } from "@/lib/safe-href";
import { cn } from "@/lib/utils";
import type { BannerView } from "@/server/services/banners";

const AUTO_ADVANCE_MS = 6000;
const CTA = "mt-6 inline-flex self-start min-h-11 items-center justify-center rounded-full bg-brand px-8 py-3 font-display text-xl tracking-wide text-brand-ink transition-colors hover:bg-[#e6ff7a]";

function Slide({ banner, index, total, active }: { banner: BannerView; index: number; total: number; active: boolean }) {
  const common = { alt: "", sizes: "100vw", priority: index === 0, quality: 80 };
  const desktop = getImageProps({ ...common, src: banner.imageUrl!, width: 1920, height: 820 }).props;
  const mobile = getImageProps({ ...common, src: banner.mobileImageUrl ?? banner.imageUrl!, width: 1080, height: 1350 }).props;
  const cta = banner.ctaHref && banner.ctaLabel && isSafeHref(banner.ctaHref) ? { href: banner.ctaHref, label: banner.ctaLabel } : null;
  const testId = index === 0 ? "hero-cta" : undefined;
  return (
    <div
      role="group"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${total}`}
      className="relative h-full w-full shrink-0 snap-start"
      data-testid="hero-slide"
      // Off-screen slides stay in the DOM for the scroll-snap track; `inert` drops them from
      // tab order and the accessibility tree so a screen reader doesn't read every slide at once.
      inert={!active}
      aria-hidden={!active}
    >
      <picture>
        <source media="(min-width: 768px)" srcSet={desktop.srcSet} sizes="100vw" />
        <img {...mobile} alt="" className="absolute inset-0 size-full object-cover" />
      </picture>
      <div className="absolute inset-0 bg-gradient-to-t from-bg via-bg/40 to-transparent" aria-hidden="true" />
      <div className="container-x relative flex h-full flex-col justify-end pb-16 md:pb-20">
        <h2 className="max-w-3xl text-[14vw] leading-[0.85] sm:text-7xl lg:text-8xl">{banner.title}</h2>
        {banner.subtitle && <p className="mt-3 max-w-md text-base text-text-muted md:text-lg">{banner.subtitle}</p>}
        {cta && (isExternalHref(cta.href)
          ? <a href={cta.href} target="_blank" rel="noopener noreferrer" className={CTA} data-testid={testId}>{cta.label}</a>
          : <Link href={cta.href} className={CTA} data-testid={testId}>{cta.label}</Link>)}
      </div>
    </div>
  );
}

export function HeroBanners({ banners }: { banners: BannerView[] }) {
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const reduced = useReducedMotionSafe();

  const go = useCallback((i: number) => {
    const el = track.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: reduced ? "auto" : "smooth" });
  }, [reduced]);

  useEffect(() => {
    if (reduced || paused || banners.length < 2) return;
    const t = window.setTimeout(() => go((active + 1) % banners.length), AUTO_ADVANCE_MS);
    return () => window.clearTimeout(t);
  }, [active, paused, reduced, banners.length, go]);

  const onScroll = () => {
    const el = track.current;
    if (el) setActive(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };

  return (
    <section
      aria-roledescription="carousel"
      aria-label="Featured"
      className="relative border-b border-border"
      data-testid="hero"
      onPointerEnter={() => setPaused(true)}
      onPointerLeave={() => setPaused(false)}
      onFocusCapture={() => setPaused(true)}
      onBlurCapture={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div
        ref={track}
        onScroll={onScroll}
        className="flex h-[78dvh] max-h-[760px] min-h-[480px] snap-x snap-mandatory overflow-x-auto overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-live={paused || reduced ? "polite" : "off"}
      >
        {banners.map((b, i) => <Slide key={b.id} banner={b} index={i} total={banners.length} active={i === active} />)}
      </div>
      {banners.length > 1 && (
        <div className="absolute inset-x-0 bottom-1 flex justify-center">
          {banners.map((b, i) => (
            <button key={b.id} type="button" onClick={() => go(i)} aria-label={`Show slide ${i + 1}`} aria-current={i === active ? "true" : undefined} className="flex size-11 items-center justify-center">
              <span className={cn("block h-1.5 rounded-full transition-all", i === active ? "w-6 bg-text" : "w-1.5 bg-text/40")} />
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
