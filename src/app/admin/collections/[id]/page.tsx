import Link from "next/link";
import { notFound } from "next/navigation";
import { CollectionEditor } from "@/components/admin/collection-editor";
import { CollectionProducts } from "@/components/admin/collection-products";
import { HeroUploader } from "@/components/admin/hero-uploader";
import { NotFoundError } from "@/server/errors";
import { getAdminCollection } from "@/server/services/admin-collections";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "Edit collection" };

export default async function EditCollectionPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const collection = await getAdminCollection(id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  return (
    <div className="space-y-6">
      <Link href="/admin/collections" className="inline-flex min-h-11 items-center text-sm text-text-muted hover:text-text">← Collections</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-5xl">{collection.name}</h1>
        {collection.isActive && <Link href={`/collections/${collection.slug}`} target="_blank" className="inline-flex min-h-11 items-center text-sm underline-offset-4 hover:underline">View on store ↗</Link>}
      </div>
      <CollectionEditor key={collection.id} collection={collection} />
      <HeroUploader collectionId={collection.id} heroImageUrl={collection.heroImageUrl} />
      <CollectionProducts key={collection.products.map((p) => p.id).join()} collectionId={collection.id} products={collection.products} />
    </div>
  );
}
