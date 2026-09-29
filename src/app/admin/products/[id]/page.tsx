import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteProductButton } from "@/components/admin/delete-product-button";
import { ProductEditor } from "@/components/admin/product-editor";
import { StatusBadge } from "@/components/admin/status-badge";
import { NotFoundError } from "@/server/errors";
import { listCollectionOptions } from "@/server/services/admin-collections";
import { getAdminProduct } from "@/server/services/admin-products";
import { requireAdminPage } from "../../guard";

type Props = { params: Promise<{ id: string }> };

export const metadata = { title: "Edit product" };

export default async function EditProductPage({ params }: Props) {
  await requireAdminPage();
  const { id } = await params;
  const product = await getAdminProduct(id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  const collections = await listCollectionOptions();
  return (
    <div className="space-y-6">
      <Link href="/admin/products" className="text-sm text-text-muted hover:text-text">← Products</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-5xl">{product.name}</h1>
        <StatusBadge status={product.status} />
        {product.status === "ACTIVE" && <Link href={`/products/${product.slug}`} target="_blank" className="text-sm underline-offset-4 hover:underline" data-testid="view-on-store">View on store ↗</Link>}
      </div>
      <ProductEditor key={product.variants.map((v) => `${v.id}:${v.stock}:${v.pricePaise}`).join()} product={product} collections={collections} />
      <section className="rounded-md border border-danger/40 p-5">
        <h2 className="mb-2 text-xl">Danger zone</h2>
        <DeleteProductButton id={product.id} status={product.status} />
      </section>
    </div>
  );
}
