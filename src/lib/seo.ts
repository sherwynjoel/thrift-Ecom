import type { Metadata } from "next";

export const META_DESCRIPTION_MAX = 155;
export const DEFAULT_OG_IMAGE = { url: "/brand-og", width: 1200, height: 630, alt: "" };
export const NO_INDEX = { index: false, follow: false } as const;

export function metaDescription(text: string | null | undefined, fallback: string): string {
  const plain = (text ?? "")
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, "$1")   // [label](url) and images → label
    .replace(/[#*_`>~]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return fallback;
  if (plain.length <= META_DESCRIPTION_MAX) return plain;
  const cut = plain.slice(0, META_DESCRIPTION_MAX - 1);
  const space = cut.lastIndexOf(" ");
  return `${(space > 80 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

function social(path: string, title: string, description: string, siteName: string, image: { url: string; alt: string } | null): Metadata {
  const images = image ? [{ url: image.url, alt: image.alt || title }] : [{ ...DEFAULT_OG_IMAGE, alt: siteName }];
  return {
    alternates: { canonical: path },
    openGraph: { type: "website", url: path, siteName, locale: "en_IN", title, description, images },
    twitter: { card: "summary_large_image", title, description, images: images.map((i) => i.url) },
  };
}

export function productMetadata(p: { slug: string; name: string; description: string; images: { url: string; alt: string }[] }, brandName: string): Metadata {
  const description = metaDescription(p.description, `${p.name} by ${brandName}`);
  return { title: p.name, description, ...social(`/products/${p.slug}`, p.name, description, brandName, p.images[0] ?? null) };
}

export function collectionMetadata(c: { slug: string; name: string; description: string; heroImageUrl: string | null }, brandName: string): Metadata {
  const description = metaDescription(c.description, `Shop ${c.name} at ${brandName}`);
  return { title: c.name, description, ...social(`/collections/${c.slug}`, c.name, description, brandName, c.heroImageUrl ? { url: c.heroImageUrl, alt: c.name } : null) };
}

export function websiteJsonLd(args: { name: string; url: string; sameAs: string[] }): Record<string, unknown>[] {
  return [
    {
      "@context": "https://schema.org",
      "@type": "WebSite",
      name: args.name,
      url: args.url,
      potentialAction: { "@type": "SearchAction", target: `${args.url}/search?q={search_term_string}`, "query-input": "required name=search_term_string" },
    },
    { "@context": "https://schema.org", "@type": "Organization", name: args.name, url: args.url, sameAs: args.sameAs },
  ];
}
