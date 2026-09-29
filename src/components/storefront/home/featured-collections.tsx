import Image from "next/image";
import Link from "next/link";
import { Parallax, Reveal } from "@/components/motion";
import { listCollections, listProducts } from "@/server/services/catalog";
import { SectionHeading } from "./section-heading";

export async function FeaturedCollections() {
  const collections = (await listCollections({ featuredOnly: true })).slice(0, 3);
  const covers = await Promise.all(
    collections.map(async (c) => c.heroImageUrl ?? (await listProducts({ collectionSlug: c.slug, pageSize: 1 })).items[0]?.images[0]?.url ?? null),
  );
  if (!collections.length) return null;
  return (
    <section className="container-x py-20" data-testid="featured-collections">
      <SectionHeading eyebrow="Collections" title="Pick a lane" href="/collections" />
      <div className="grid gap-4 md:grid-cols-3">
        {collections.map((c, i) => (
          <Reveal key={c.id} delay={i * 0.1}>
            <Link href={`/collections/${c.slug}`} className="group relative block aspect-[3/4] overflow-hidden rounded-sm bg-surface">
              {covers[i] && (
                <Parallax amount={24} className="absolute inset-[-12%]">
                  <Image src={covers[i]!} alt="" fill sizes="(min-width: 768px) 33vw, 100vw" className="object-cover opacity-80 transition-transform duration-700 group-hover:scale-105" />
                </Parallax>
              )}
              <div className="absolute inset-0 bg-gradient-to-t from-bg via-transparent to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6">
                <p className="font-display text-4xl uppercase leading-none">{c.name}</p>
                <p className="text-sm text-text-muted">{c.productCount} styles</p>
              </div>
            </Link>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
