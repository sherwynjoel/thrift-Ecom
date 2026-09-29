"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { MagneticButton, Parallax, useReducedMotionSafe } from "@/components/motion";
import { BRAND } from "@/config/brand";

const HEADLINE = ["Wear", "what", "you", "mean."];

export function Hero() {
  const router = useRouter();
  const reduced = useReducedMotionSafe();
  return (
    <section className="relative overflow-hidden border-b border-border" data-testid="hero">
      <div className="container-x grid min-h-[80dvh] items-center gap-8 py-16 lg:grid-cols-[1.2fr_1fr]">
        <div>
          <p className="mb-4 text-xs uppercase tracking-[0.3em] text-text-muted">{BRAND.name} · New season</p>
          <h1 className="text-[18vw] leading-[0.82] sm:text-[12vw] lg:text-[9vw]" aria-label={HEADLINE.join(" ")}>
            {HEADLINE.map((word, i) => (
              <span key={word} className="inline-block overflow-hidden pr-[0.15em]">
                <motion.span
                  className="inline-block"
                  initial={reduced ? false : { y: "110%" }}
                  animate={{ y: 0 }}
                  transition={{ duration: 0.8, delay: 0.1 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                >
                  {word}
                </motion.span>
              </span>
            ))}
          </h1>
          <p className="mt-6 max-w-md text-lg text-text-muted">Heavyweight tees, loud prints, and a design tool for the ones you make yourself.</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <MagneticButton onClick={() => router.push("/collections/new-drops")} data-testid="hero-cta">Shop new drops</MagneticButton>
            <button type="button" onClick={() => router.push("/customize")} className="rounded-full border border-border px-8 py-4 font-display text-xl tracking-wide hover:border-text">Design your own</button>
          </div>
        </div>
        <Parallax amount={30} className="relative mx-auto aspect-[4/5] w-full max-w-md">
          <Image src="/seed/tee-lime-front.svg" alt="" fill priority sizes="(min-width: 1024px) 40vw, 90vw" className="object-cover rounded-sm" />
        </Parallax>
      </div>
      <div className="pointer-events-none absolute -bottom-24 -left-24 size-[420px] rounded-full bg-brand/10 blur-3xl" aria-hidden="true" />
    </section>
  );
}
