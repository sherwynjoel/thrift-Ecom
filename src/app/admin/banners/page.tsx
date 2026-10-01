import Link from "next/link";
import { BannerList } from "@/components/admin/banner-list";
import { Button } from "@/components/ui/button";
import { listAdminBanners } from "@/server/services/banners";
import { requireAdminPage } from "../guard";

export const metadata = { title: "Banners" };

export default async function AdminBannersPage() {
  await requireAdminPage();
  const rows = await listAdminBanners();
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <h1 className="text-4xl sm:text-5xl">Banners</h1>
        <Button className="h-11 px-4" render={<Link href="/admin/banners/new" />} nativeButton={false} data-testid="new-banner">New banner</Button>
      </div>
      <section className="space-y-3">
        <h2 className="text-2xl">Hero slides</h2>
        <p className="text-sm text-text-muted">Full-width image slides at the top of the homepage. With none live, the homepage shows the default hero.</p>
        <BannerList rows={rows.filter((r) => r.placement === "HERO")} empty="No hero slides yet." />
      </section>
      <section className="space-y-3">
        <h2 className="text-2xl">Ticker lines</h2>
        <p className="text-sm text-text-muted">Short lines in the scrolling strip under the hero. With none live, the default lines show.</p>
        <BannerList rows={rows.filter((r) => r.placement === "STRIP")} empty="No ticker lines yet." />
      </section>
    </div>
  );
}
