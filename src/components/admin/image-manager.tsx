"use client";

import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import {
  deleteProductImageAction, reorderProductImagesAction, updateProductImageAction, uploadProductImagesAction,
} from "@/app/admin/products/image-actions";
import { Button } from "@/components/ui/button";
import { imageFileError, MAX_FILES_PER_UPLOAD } from "@/lib/uploads";
import { cn } from "@/lib/utils";
import type { AdminImage } from "@/server/services/admin-products";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const iconButton = "grid size-11 shrink-0 place-items-center rounded-md text-text-muted transition-colors disabled:opacity-30 hover:bg-surface-raised hover:text-text";

export function ImageManager({ productId, images, colorNames }: { productId: string; images: AdminImage[]; colorNames: string[] }) {
  const [list, setList] = useState(images);
  const [pending, start] = useTransition();
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [savedAltId, setSavedAltId] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  useEffect(() => {
    if (!confirmDeleteId) return;
    const t = setTimeout(() => setConfirmDeleteId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmDeleteId]);

  useEffect(() => {
    if (!savedAltId) return;
    const t = setTimeout(() => setSavedAltId(null), 2000);
    return () => clearTimeout(t);
  }, [savedAltId]);

  const upload = (files: FileList | null) => {
    // Snapshot the files into a plain array before clearing the input: `files` is the *same live*
    // FileList as `fileRef.current.files` (not a copy), so resetting `fileRef.current.value` first
    // would empty it out from under us and every upload would silently no-op.
    const picked = files ? Array.from(files) : [];
    if (fileRef.current) fileRef.current.value = "";
    if (!picked.length) return;
    if (picked.length > MAX_FILES_PER_UPLOAD) {
      toast.error(`Upload at most ${MAX_FILES_PER_UPLOAD} images at a time`);
      return;
    }
    const problem = picked.map(imageFileError).find((p) => p !== null);
    if (problem) {
      toast.error(problem);
      return;
    }
    start(async () => {
      let added = 0;
      let firstError: string | null = null;
      for (const [i, file] of picked.entries()) {
        setProgress({ current: i + 1, total: picked.length });
        const fd = new FormData();
        fd.append("files", file);
        try {
          const r = await uploadProductImagesAction(productId, fd);
          if (r.ok) {
            setList((l) => [...l, ...r.data]);
            added += r.data.length;
          } else {
            firstError ??= r.fieldErrors?.files?.[0] ?? r.fieldErrors?.file?.[0] ?? r.message;
          }
        } catch {
          firstError ??= `${file.name}: upload failed — check your connection and try again`;
        }
      }
      setProgress(null);
      if (added) {
        toast.success(`${added} image(s) added`);
        router.refresh();
      }
      if (firstError) toast.error(firstError);
    });
  };

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    setList(next);
    start(async () => {
      try {
        const r = await reorderProductImagesAction(productId, next.map((x) => x.id));
        if (!r.ok) {
          toast.error(r.message);
          setList(list);
        }
      } catch {
        toast.error(GENERIC_ERROR);
        setList(list);
      }
    });
  };

  const save = (img: AdminImage, patch: Partial<Pick<AdminImage, "alt" | "colorName">>) => {
    const merged = { ...img, ...patch };
    setList((l) => l.map((x) => (x.id === img.id ? merged : x)));
    start(async () => {
      try {
        const r = await updateProductImageAction(img.id, { alt: merged.alt, colorName: merged.colorName });
        if (!r.ok) {
          toast.error(r.message);
          return;
        }
        if ("alt" in patch) setSavedAltId(img.id);
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });
  };

  const remove = (img: AdminImage) =>
    start(async () => {
      try {
        const r = await deleteProductImageAction(img.id);
        if (!r.ok) return void toast.error(r.message);
        setList((l) => l.filter((x) => x.id !== img.id));
        router.refresh();
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });

  const clickDelete = (img: AdminImage) => {
    if (confirmDeleteId === img.id) {
      setConfirmDeleteId(null);
      remove(img);
    } else {
      setConfirmDeleteId(img.id);
    }
  };

  return (
    <section className="space-y-4 rounded-md border border-border bg-surface p-5" data-testid="image-manager">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-2xl">Images</h2>
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" multiple hidden onChange={(e) => upload(e.target.files)} data-testid="image-input" />
        <Button type="button" variant="secondary" disabled={pending} onClick={() => fileRef.current?.click()}>
          <Upload className="mr-2 size-4" />
          {progress ? `Uploading ${progress.current}/${progress.total}` : pending ? "Working…" : "Upload images"}
        </Button>
      </div>
      <p className="text-xs text-text-muted">PNG, JPG or WebP, up to 5 MB each, {MAX_FILES_PER_UPLOAD} at a time. Tag an image with a color so the gallery shows it when that swatch is picked. The first image is the card image.</p>
      {list.length === 0 ? (
        <p className="py-6 text-center text-sm text-text-muted" data-testid="images-empty">No images yet.</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {list.map((img, i) => {
            const orphanColor = img.colorName && !colorNames.includes(img.colorName) ? img.colorName : null;
            return (
              <li key={img.id} className="flex gap-3 rounded-md border border-border bg-bg p-3" data-testid="image-item">
                <div className="relative aspect-[4/5] w-20 shrink-0 overflow-hidden rounded-sm bg-surface-raised">
                  <Image src={img.url} alt={img.alt} fill sizes="80px" className="object-cover" />
                </div>
                <div className="flex min-w-0 flex-1 flex-col gap-2 text-sm">
                  <div className="flex items-center gap-2">
                    <input
                      defaultValue={img.alt}
                      aria-label="Alt text"
                      placeholder="Describe the image"
                      onBlur={(e) => e.target.value !== img.alt && save(img, { alt: e.target.value })}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        if (e.currentTarget.value !== img.alt) save(img, { alt: e.currentTarget.value });
                      }}
                      className="h-8 min-w-0 flex-1 rounded-md border border-border bg-surface px-2"
                    />
                    {savedAltId === img.id && <span className="shrink-0 text-xs text-text-muted" data-testid="alt-saved">Saved</span>}
                  </div>
                  <select value={img.colorName ?? ""} aria-label="Color tag" onChange={(e) => save(img, { colorName: e.target.value || null })} className="h-8 rounded-md border border-border bg-surface px-2">
                    <option value="">All colors</option>
                    {orphanColor && <option value={orphanColor}>{orphanColor} (missing)</option>}
                    {colorNames.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  <div className="mt-auto flex flex-wrap items-center gap-1">
                    <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || pending} aria-label="Move earlier" className={iconButton}><ArrowUp className="size-5" /></button>
                    <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1 || pending} aria-label="Move later" className={iconButton}><ArrowDown className="size-5" /></button>
                    <button
                      type="button"
                      onClick={() => clickDelete(img)}
                      disabled={pending}
                      aria-label={confirmDeleteId === img.id ? "Confirm delete image" : "Delete image"}
                      className={cn(iconButton, "ml-auto", confirmDeleteId === img.id ? "bg-danger/10 text-danger hover:bg-danger/20 hover:text-danger" : "hover:text-danger")}
                    >
                      {confirmDeleteId === img.id ? <span className="px-1 text-xs font-medium">Confirm?</span> : <Trash2 className="size-5" />}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
