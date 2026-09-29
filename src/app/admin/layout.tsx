import type { Metadata } from "next";
import { AdminNav } from "@/components/admin/admin-nav";
import { SignOutButton } from "@/components/storefront/account/sign-out-button";
import { BRAND } from "@/config/brand";
import { requireAdminPage } from "./guard";

export const metadata: Metadata = { title: { default: "Admin", template: `%s · Admin | ${BRAND.name}` }, robots: { index: false, follow: false } };

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdminPage();
  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[220px_1fr]" data-testid="admin-shell">
      <aside className="border-b border-border bg-surface p-4 lg:sticky lg:top-0 lg:h-dvh lg:border-b-0 lg:border-r">
        <div className="mb-4 flex items-center justify-between lg:mb-8 lg:block">
          <p className="font-display text-2xl uppercase">{BRAND.name}</p>
          <p className="text-xs uppercase tracking-widest text-text-muted">Admin</p>
        </div>
        <AdminNav />
        <div className="mt-6 hidden lg:block"><SignOutButton /></div>
      </aside>
      <main className="min-w-0 p-4 sm:p-8">{children}</main>
    </div>
  );
}
