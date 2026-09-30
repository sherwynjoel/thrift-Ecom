import Link from "next/link";
import { notFound } from "next/navigation";
import { CouponForm } from "@/components/admin/coupon-form";
import { DeleteButton } from "@/components/admin/delete-button";
import { PromoStatePill } from "@/components/admin/promo-state-pill";
import { NotFoundError } from "@/server/errors";
import { getCoupon } from "@/server/services/admin-promotions";
import { requireAdminPage } from "../../guard";
import { deleteCouponAction } from "../actions";

export const metadata = { title: "Edit coupon" };
export const dynamic = "force-dynamic";

export default async function EditCouponPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const coupon = await getCoupon(id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <Link href="/admin/coupons" className="inline-flex min-h-11 items-center text-sm text-text-muted hover:text-text">← Coupons</Link>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="break-all font-mono text-4xl sm:text-5xl">{coupon.code}</h1>
        <PromoStatePill promo={coupon} />
      </div>
      <p className="text-sm text-text-muted" data-testid="coupon-uses">
        Used on {coupon.uses} paid {coupon.uses === 1 ? "order" : "orders"}{coupon.usageLimit ? ` of ${coupon.usageLimit} allowed` : ""}.
      </p>
      <CouponForm key={coupon.id} coupon={coupon} />
      <div className="max-w-2xl space-y-2">
        <DeleteButton
          label="Delete coupon"
          confirmText="The code stops working immediately. Codes that have been used can't be deleted; untick Active instead."
          onConfirm={deleteCouponAction.bind(null, coupon.id)}
          redirectTo="/admin/coupons"
        />
      </div>
    </div>
  );
}
