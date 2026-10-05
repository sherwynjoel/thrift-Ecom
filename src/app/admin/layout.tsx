import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/storefront/account/sign-out-button";
import { BRAND } from "@/config/brand";
import { countToShip } from "@/server/services/admin-orders";
import { countPendingReviews } from "@/server/services/admin-reviews";
import { countPrintQueue } from "@/server/services/print-queue";
import { requireAdminPage } from "./guard";

export const metadata: Metadata = { title: { default: "Admin", template: `%s · Admin | ${BRAND.name}` }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  const [toShip, toPrint, toReview] = await Promise.all([countToShip(), countPrintQueue(), countPendingReviews()]);
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[220px_1fr] print:block" data-testid="admin-shell">
      {/* Below lg: a sticky top bar (menu drawer, brand, sign out). lg+: the sticky sidebar column.
          One SignOutButton serves both, so data-testid="sign-out" is never duplicated. */}
      <aside className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b border-border bg-surface/95 px-4 backdrop-blur lg:h-dvh lg:flex-col lg:items-stretch lg:gap-0 lg:overflow-y-auto lg:border-b-0 lg:border-r lg:bg-surface lg:p-4 lg:backdrop-blur-none print:hidden">
        <AdminNav toShipCount={toShip} printQueueCount={toPrint} pendingReviewCount={toReview} />
        <div className="flex min-w-0 items-baseline gap-2 lg:order-1 lg:mb-8 lg:block">
          <p className="truncate font-display text-xl uppercase lg:text-2xl">{BRAND.name}</p>
          <p className="text-xs uppercase tracking-widest text-text-muted">Admin</p>
        </div>
        <div className="ml-auto lg:order-3 lg:ml-0 lg:mt-6">
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-8 print:p-0">{children}</main>
    </div>
  );
}
