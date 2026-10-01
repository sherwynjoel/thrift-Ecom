import type { Metadata } from "next";
import { BrandStory } from "@/components/storefront/home/brand-story";
import { CustomizeTeaser } from "@/components/storefront/home/customize-teaser";
import { FeaturedCollections } from "@/components/storefront/home/featured-collections";
import { Hero } from "@/components/storefront/home/hero";
import { HeroBanners } from "@/components/storefront/home/hero-banners";
import { NewDrops } from "@/components/storefront/home/new-drops";
import { Ticker } from "@/components/storefront/home/ticker";
import { BRAND } from "@/config/brand";
import { jsonLdScript } from "@/lib/json-ld";
import { websiteJsonLd } from "@/lib/seo";
import { siteUrl } from "@/lib/site-url";
import { getLiveBanners } from "@/server/services/banners";

// A plain string here would still run through the root layout's `%s | ${BRAND.name}` template
// (Next.js only skips the template for `title.absolute`), so use `absolute` to get the bare string.
export const metadata: Metadata = {
  title: { absolute: `${BRAND.name} — ${BRAND.tagline}` },
  description: BRAND.tagline,
  alternates: { canonical: "/" },
};

export default async function HomePage() {
  const { hero, strip } = await getLiveBanners();
  const jsonLd = websiteJsonLd({ name: BRAND.name, url: siteUrl(), sameAs: Object.values(BRAND.social) });
  return (
    <>
      {hero.length > 0 ? (
        <>
          <h1 className="sr-only">{BRAND.name} — {BRAND.tagline}</h1>
          <HeroBanners banners={hero} />
        </>
      ) : (
        <Hero />
      )}
      <Ticker items={strip.length > 0 ? strip.map((b) => b.title) : undefined} />
      <FeaturedCollections />
      <NewDrops />
      <CustomizeTeaser />
      <BrandStory />
      {jsonLd.map((ld, i) => <script key={i} type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLdScript(ld) }} />)}
    </>
  );
}
