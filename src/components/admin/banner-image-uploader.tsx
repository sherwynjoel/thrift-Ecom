"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { setBannerImageAction } from "@/app/admin/banners/actions";
import { Button } from "@/components/ui/button";
import { imageFileError } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import type { BannerSlot } from "@/server/services/banners";

export function BannerImageUploader({ bannerId, slot, url, label, hint }: { bannerId: string; slot: BannerSlot; url: string | null; label: string; hint: string }) {
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const send = (fd: FormData | null) =>
    start(async () => {
      try {
        const r = await setBannerImageAction(bannerId, slot, fd);
        if (ref.current) ref.current.value = "";
        if (!r.ok) return void toast.error(r.fieldErrors?.file?.[0] ?? r.message);
        toast.success(r.data.url ? "Image updated" : "Image removed");
        router.refresh();
      } catch {
        if (ref.current) ref.current.value = "";
        toast.error("Something went wrong. Please try again.");
      }
    });
  const pick = (file: File | undefined) => {
    if (!file) return;
    const problem = imageFileError(file);
    if (problem) {
      if (ref.current) ref.current.value = "";
      toast.error(problem);
      return;
    }
    const fd = new FormData();
    fd.append("file", file);
    send(fd);
  };
  return (
    <section className="space-y-3 rounded-md border border-border bg-surface p-4 sm:p-5" data-testid={`banner-image-${slot}`}>
      <h2 className="text-2xl">{label}</h2>
      <p className="text-xs text-text-muted">{hint}</p>
      <div className={cn("relative overflow-hidden rounded-sm bg-surface-raised", slot === "desktop" ? "aspect-[1920/820]" : "aspect-[4/5] max-w-40")}>
        {url ? (
          <Image src={url} alt="" fill sizes={slot === "desktop" ? "400px" : "160px"} className="object-cover" />
        ) : (
          <span className="absolute inset-0 grid place-items-center text-xs text-text-muted">No image</span>
        )}
      </div>
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        <Button type="button" variant="secondary" className="h-11 px-4" disabled={pending} onClick={() => ref.current?.click()}>{pending ? "Working…" : url ? "Replace" : "Upload"}</Button>
        {url && <Button type="button" variant="ghost" className="h-11 px-4" disabled={pending} onClick={() => send(null)}>Remove</Button>}
      </div>
    </section>
  );
}
