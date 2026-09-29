"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  deleteProductImageAction, reorderProductImagesAction, updateProductImageAction, uploadProductImagesAction,
} from "@/app/admin/products/image-actions";
import { Button } from "@/components/ui/button";
import type { AdminImage } from "@/server/services/admin-products";

export function ImageManager({ productId, images, colorNames }: { productId: string; images: AdminImage[]; colorNames: string[] }) {
  const [list, setList] = useState(images);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const upload = (files: FileList | null) => {
    if (!files?.length) return;
    const fd = new FormData();
    for (const f of Array.from(files)) fd.append("files", f);
    start(async () => {
      const r = await uploadProductImagesAction(productId, fd);
      if (fileRef.current) fileRef.current.value = "";
      if (!r.ok) return void toast.error(r.fieldErrors?.files?.[0] ?? r.fieldErrors?.file?.[0] ?? r.message);
      setList((l) => [...l, ...r.data]);
      toast.success(`${r.data.length} image(s) added`);
      router.refresh();
    });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    start(async () => {
      const r = await reorderProductImagesAction(productId, next.map((x) => x.id));
      if (!r.ok) {
        toast.error(r.message);
        setList(list);
      }
    });
  };

  const save = (img: AdminImage, patch: Partial<Pick<AdminImage, "alt" | "colorName">>) => {
    const merged = { ...img, ...patch };
    setList((l) => l.map((x) => (x.id === img.id ? merged : x)));
    start(async () => {
      const r = await updateProductImageAction(img.id, { alt: merged.alt, colorName: merged.colorName });
      if (!r.ok) toast.error(r.message);
    });
  };

  const remove = (img: AdminImage) =>
    start(async () => {
      const r = await deleteProductImageAction(img.id);
      if (!r.ok) return void toast.error(r.message);
      setList((l) => l.filter((x) => x.id !== img.id));
      router.refresh();
    });

  return (
    <section className="space-y-4 rounded-md border border-border bg-surface p-5" data-testid="image-manager">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl">Images</h2>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} data-testid="image-input" />
        <Button type="button" variant="secondary" disabled={pending} onClick={() => fileRef.current?.click()}><Upload className="mr-2 size-4" />{pending ? "Working…" : "Upload images"}</Button>
      </div>
      <p className="text-xs text-text-muted">PNG, JPG or WebP, up to 5 MB each. Tag an image with a color so the gallery shows it when that swatch is picked. The first image is the card image.</p>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted" data-testid="images-empty">No images yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((img, i) => (
            <li key={img.id} className="flex gap-3 rounded-md border border-border bg-bg p-3" data-testid="image-item">
              <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-sm bg-surface-raised">
                <Image src={img.url} alt={img.alt} fill sizes="80px" className="object-cover" />
              </div>
              <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                <input defaultValue={img.alt} aria-label="Alt text" placeholder="Describe the image" onBlur={(e) => e.target.value !== img.alt && save(img, { alt: e.target.value })} className="h-8 rounded-md border border-border bg-surface px-2" />
                <select value={img.colorName ?? ""} aria-label="Color tag" onChange={(e) => save(img, { colorName: e.target.value || null })} className="h-8 rounded-md border border-border bg-surface px-2">
                  <option value="">All colors</option>
                  {colorNames.map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <div className="mt-auto flex items-center gap-1">
                  <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || pending} aria-label="Move earlier" className="p-1 disabled:opacity-30"><ArrowUp className="size-4" /></button>
                  <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1 || pending} aria-label="Move later" className="p-1 disabled:opacity-30"><ArrowDown className="size-4" /></button>
                  <button type="button" onClick={() => remove(img)} disabled={pending} aria-label="Delete image" className="ml-auto p-1 text-text-muted hover:text-danger"><Trash2 className="size-4" /></button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
