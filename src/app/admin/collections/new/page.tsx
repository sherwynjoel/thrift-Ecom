import Link from "next/link";
import { CollectionEditor } from "@/components/admin/collection-editor";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "New collection" };

export default async function NewCollectionPage() {
  await requireAdminPage();
  return (
    <div className="space-y-6">
      <Link href="/admin/collections" className="text-sm text-text-muted hover:text-text">← Collections</Link>
      <h1 className="text-5xl">New collection</h1>
      <CollectionEditor collection={null} />
    </div>
  );
}
