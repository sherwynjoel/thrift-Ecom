import type { Metadata } from "next";
import { BrandStory } from "@/components/storefront/home/brand-story";
import { CustomizeTeaser } from "@/components/storefront/home/customize-teaser";
import { FeaturedCollections } from "@/components/storefront/home/featured-collections";
import { Hero } from "@/components/storefront/home/hero";
import { NewDrops } from "@/components/storefront/home/new-drops";
import { Ticker } from "@/components/storefront/home/ticker";
import { BRAND } from "@/config/brand";

// A plain string here would still run through the root layout's `%s | ${BRAND.name}` template
// (Next.js only skips the template for `title.absolute`), so use `absolute` to get the bare string.
export const metadata: Metadata = { title: { absolute: `${BRAND.name} — ${BRAND.tagline}` } };

export default function HomePage() {
  return (
    <>
      <Hero />
      <Ticker />
      <FeaturedCollections />
      <NewDrops />
      <CustomizeTeaser />
      <BrandStory />
    </>
  );
}
