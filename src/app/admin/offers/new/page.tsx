import Link from "next/link";
import { OfferForm } from "@/components/admin/offer-form";
import { listCollectionOptions } from "@/server/services/admin-collections";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "New offer" };
export const dynamic = "force-dynamic";

export default async function NewOfferPage() {
  await requireAdminPage();
  const collections = await listCollectionOptions();
  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <Link href="/admin/offers" className="inline-flex min-h-11 items-center text-sm text-text-muted hover:text-text">← Offers</Link>
      <h1 className="text-4xl sm:text-5xl">New offer</h1>
      <OfferForm offer={null} collections={collections} />
    </div>
  );
}
