import { Federant } from "next/font/google";
import LycorisSpecimen from "@/components/ui/lycoris-specimen";
import { BRAND } from "@/config/brand";

// Self-hosted by next/font: the CSP only allows fonts from 'self', so the component's Google Fonts <link> stays off.
const federant = Federant({ weight: "400", subsets: ["latin"], display: "swap" });

// ponytail: trial hero. The old <Hero /> is untouched in hero.tsx; swap the import back in page.tsx to revert.
export function SpecimenHero() {
  return (
    <LycorisSpecimen
      name={BRAND.name}
      studio={BRAND.name}
      year="2026"
      description="Heavyweight tees, loud prints, and a design tool for the ones you make yourself."
      specs={["Oversized & regular fits", "Custom prints, designed by you", `Free delivery over ₹${BRAND.freeShippingThresholdPaise / 100}`, "Made in India"]}
      tagline={[{ text: "Wear" }, { text: "what you", small: true }, { text: "mean." }, { text: BRAND.name, small: true }]}
      multilingual="Wear·what·you·mean"
      ligatureWord="Offbeat"
      links={[
        { label: "SHOP NEW DROPS →", href: "/collections/new-drops" },
        { label: "DESIGN YOUR OWN →", href: "/customize" },
      ]}
      fontFamily={`${federant.style.fontFamily}, Georgia, serif`}
      fontHref={null}
      ink="#0A0A0A"
      bone="#F5F5F0"
      crimson="#D4FF3F"
      // Pin below the sticky 64px header (+1px border) instead of sliding under it.
      top="65px"
      height="calc(100svh - 65px)"
      sceneScroll={0.9}
    />
  );
}
