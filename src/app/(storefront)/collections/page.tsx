import type { Metadata } from "next";
import Image from "next/image";
import Link from "next/link";
import { listCollections } from "@/server/services/catalog";

export const metadata: Metadata = { title: "Collections" };

export default async function CollectionsIndex() {
  const collections = await listCollections();
  return (
    <div className="container-x py-10">
      <h1 className="mb-8 text-5xl md:text-7xl">Collections</h1>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {collections.map((c) => (
          <Link key={c.id} href={`/collections/${c.slug}`} className="group relative aspect-[4/3] overflow-hidden rounded-sm bg-surface" data-testid="collection-card">
            {c.heroImageUrl && <Image src={c.heroImageUrl} alt="" fill sizes="(min-width: 1024px) 33vw, 100vw" className="object-cover opacity-70 transition-transform duration-700 group-hover:scale-105" />}
            <div className="absolute inset-0 flex flex-col justify-end p-6">
              <span className="font-display text-4xl uppercase">{c.name}</span>
              <span className="text-sm text-text-muted">{c.productCount} products</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
