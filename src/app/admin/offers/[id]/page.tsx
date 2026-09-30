import Link from "next/link";
import { notFound } from "next/navigation";
import { DeleteButton } from "@/components/admin/delete-button";
import { OfferForm } from "@/components/admin/offer-form";
import { PromoStatePill } from "@/components/admin/promo-state-pill";
import { NotFoundError } from "@/server/errors";
import { listCollectionOptions } from "@/server/services/admin-collections";
import { getOffer } from "@/server/services/admin-promotions";
import { requireAdminPage } from "../../guard";
import { deleteOfferAction } from "../actions";

export const metadata = { title: "Edit offer" };
export const dynamic = "force-dynamic";

export default async function EditOfferPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const [offer, collections] = await Promise.all([
    getOffer(id).catch((err) => {
      if (err instanceof NotFoundError) notFound();
      throw err;
    }),
    listCollectionOptions(),
  ]);
  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <Link href="/admin/offers" className="inline-flex min-h-11 items-center text-sm text-text-muted hover:text-text">← Offers</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="break-words text-4xl sm:text-5xl">{offer.label}</h1>
        <PromoStatePill promo={offer} />
      </div>
      <p className="text-sm text-text-muted" data-testid="offer-uses">Applied to {offer.uses} paid {offer.uses === 1 ? "order" : "orders"}.</p>
      <OfferForm key={offer.id} offer={offer} collections={collections} />
      <div className="max-w-2xl">
        <DeleteButton
          label="Delete offer"
          confirmText="The offer stops applying at checkout immediately. Past orders keep their discount. This cannot be undone."
          onConfirm={deleteOfferAction.bind(null, offer.id)}
          redirectTo="/admin/offers"
        />
      </div>
    </div>
  );
}
