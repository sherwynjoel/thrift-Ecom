import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/storefront/account/sign-out-button";
import { BRAND } from "@/config/brand";
import { countToShip } from "@/server/services/admin-orders";
import { requireAdminPage } from "./guard";

export const metadata: Metadata = { title: { default: "Admin", template: `%s · Admin | ${BRAND.name}` }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  const toShip = await countToShip();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[220px_1fr] print:block" data-testid="admin-shell">
      <aside className="flex flex-wrap items-center justify-between gap-4 border-b border-border bg-surface p-4 lg:flex-col lg:items-stretch lg:justify-start lg:gap-0 lg:sticky lg:top-0 lg:h-dvh lg:overflow-y-auto lg:border-b-0 lg:border-r print:hidden">
        <div className="lg:mb-8">
          <p className="font-display text-2xl uppercase">{BRAND.name}</p>
          <p className="text-xs uppercase tracking-widest text-text-muted">Admin</p>
        </div>
        {/* Reordered per breakpoint so the same nodes form a header row (brand + sign out) with the
            nav below on phones, and the original brand / nav / sign-out column on lg+, without ever
            mounting <SignOutButton> twice (it would duplicate data-testid="sign-out"). */}
        <div className="order-2 w-full lg:order-1">
          <AdminNav toShipCount={toShip} />
        </div>
        <div className="order-1 lg:order-2 lg:mt-6">
          <SignOutButton />
        </div>
      </aside>
      <main className="min-w-0 p-4 sm:p-8 print:p-0">{children}</main>
    </div>
  );
}
