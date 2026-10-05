import Link from "next/link";
import { BannerForm } from "@/components/admin/banner-form";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "New banner" };

export default async function NewBannerPage() {
  await requireAdminPage();
  return (
    <div className="space-y-6">
      <Link href="/admin/banners" className="inline-flex min-h-11 items-center text-sm text-text-muted hover:text-text">← Banners</Link>
      <h1 className="text-4xl sm:text-5xl">New banner</h1>
      <BannerForm banner={null} />
    </div>
  );
}
