import Link from "next/link";
import { CouponForm } from "@/components/admin/coupon-form";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "New coupon" };

export default async function NewCouponPage() {
  await requireAdminPage();
  return (
    <div className="space-y-6 pb-24 lg:pb-0">
      <Link href="/admin/coupons" className="inline-flex min-h-11 items-center text-sm text-text-muted hover:text-text">← Coupons</Link>
      <h1 className="text-4xl sm:text-5xl">New coupon</h1>
      <CouponForm coupon={null} />
    </div>
  );
}
