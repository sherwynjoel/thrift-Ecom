"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { toast } from "sonner";
import { setCollectionHeroAction } from "@/app/admin/collections/actions";
import { Button } from "@/components/ui/button";
import { imageFileError } from "@/lib/uploads";

export function HeroUploader({ collectionId, heroImageUrl }: { collectionId: string; heroImageUrl: string | null }) {
  const ref = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const send = (fd: FormData | null) =>
    start(async () => {
      try {
        const r = await setCollectionHeroAction(collectionId, fd);
        if (ref.current) ref.current.value = "";
        if (!r.ok) return void toast.error(r.fieldErrors?.file?.[0] ?? r.message);
        toast.success(r.data ? "Hero image updated" : "Hero image removed");
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
    <section className="max-w-2xl space-y-3 rounded-md border border-border bg-surface p-5" data-testid="hero-uploader">
      <h2 className="text-2xl">Hero image</h2>
      {heroImageUrl ? (
        <div className="relative aspect-[3/1] overflow-hidden rounded-sm bg-surface-raised"><Image src={heroImageUrl} alt="" fill sizes="640px" className="object-cover" /></div>
      ) : (
        <p className="text-sm text-text-muted">No hero image. The first product image is used instead.</p>
      )}
      <input ref={ref} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(e) => pick(e.target.files?.[0])} />
      <div className="flex gap-2">
        <Button type="button" variant="secondary" disabled={pending} onClick={() => ref.current?.click()}>{heroImageUrl ? "Replace" : "Upload"}</Button>
        {heroImageUrl && <Button type="button" variant="ghost" disabled={pending} onClick={() => send(null)}>Remove</Button>}
      </div>
    </section>
  );
}
