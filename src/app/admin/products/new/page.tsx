import Link from "next/link";
import { ProductEditor } from "@/components/admin/product-editor";
import { listCollectionOptions } from "@/server/services/admin-collections";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "New product" };

export default async function NewProductPage() {
  await requireAdminPage();
  const collections = await listCollectionOptions();
  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <Link href="/admin/products" className="inline-flex min-h-11 items-center text-sm text-text-muted hover:text-text">← Products</Link>
      <h1 className="text-5xl">New product</h1>
      <ProductEditor product={null} collections={collections} />
    </div>
  );
}
