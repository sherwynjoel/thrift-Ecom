import Link from "next/link";
import { notFound } from "next/navigation";
import { BannerForm } from "@/components/admin/banner-form";
import { BannerImageUploader } from "@/components/admin/banner-image-uploader";
import { DeleteButton } from "@/components/admin/delete-button";
import { NotFoundError } from "@/server/errors";
import { getAdminBanner } from "@/server/services/banners";
import { deleteBannerAction } from "../actions";
import { requireAdminPage } from "../../guard";

export const metadata = { title: "Edit banner" };

export default async function EditBannerPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAdminPage();
  const { id } = await params;
  const banner = await getAdminBanner(id).catch((err) => {
    if (err instanceof NotFoundError) notFound();
    throw err;
  });
  return (
    <div className="space-y-6">
      <Link href="/admin/banners" className="inline-flex min-h-11 items-center text-sm text-text-muted hover:text-text">← Banners</Link>
      <h1 className="break-words text-4xl sm:text-5xl">{banner.title}</h1>
      <BannerForm key={banner.id} banner={banner} />
      {banner.placement === "HERO" && (
        <div className="grid max-w-3xl gap-4 md:grid-cols-2">
          <BannerImageUploader bannerId={banner.id} slot="desktop" url={banner.imageUrl} label="Desktop image" hint="1920 × 820 px, PNG/JPG/WebP up to 5 MB. Required before the slide can go live." />
          <BannerImageUploader bannerId={banner.id} slot="mobile" url={banner.mobileImageUrl} label="Phone image (optional)" hint="1080 × 1350 px portrait. Without it phones get a crop of the desktop image." />
        </div>
      )}
      <DeleteButton label="Delete banner" confirmText={`Delete “${banner.title}”? This cannot be undone.`} onConfirm={deleteBannerAction.bind(null, banner.id)} redirectTo="/admin/banners" />
    </div>
  );
}
