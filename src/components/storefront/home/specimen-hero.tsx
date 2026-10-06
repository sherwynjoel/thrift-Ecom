import { Federant } from "next/font/google";
import LycorisSpecimen from "@/components/ui/lycoris-specimen";
import { BRAND } from "@/config/brand";

// Self-hosted by next/font: the CSP only allows fonts from 'self', so the component's Google Fonts <link> stays off.
const federant = Federant({ weight: "400", subsets: ["latin"], display: "swap" });

// Cover frame only (sceneScroll 0): one screen, no scroll-driven slides. The old <Hero /> stays in hero.tsx.
export function SpecimenHero() {
  return (
    <LycorisSpecimen
      name={BRAND.name}
      studio={BRAND.name}
      year="2026"
      description="Heavyweight tees, loud prints, and a design tool for the ones you make yourself."
      specs={["Oversized & regular fits", "Custom prints, designed by you", `Free delivery over ₹${BRAND.freeShippingThresholdPaise / 100}`, "Made in India"]}
      fontFamily={`${federant.style.fontFamily}, Georgia, serif`}
      fontHref={null}
      ink="#0A0A0A"
      bone="#F5F5F0"
      crimson="#D4FF3F"
      // 60% of the screen, so the next section shows below. Pinned under the 65px sticky header.
      top="65px"
      height="60svh"
      sceneScroll={0}
    />
  );
}
