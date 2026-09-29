"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCollectionAction, saveCollectionAction } from "@/app/admin/collections/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminCollectionDetail } from "@/server/services/admin-collections";
import { FieldError } from "./field-error";

export function CollectionEditor({ collection }: { collection: AdminCollectionDetail | null }) {
  const [name, setName] = useState(collection?.name ?? "");
  const [slug, setSlug] = useState(collection?.slug ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [isFeatured, setFeatured] = useState(collection?.isFeatured ?? false);
  const [isActive, setActive] = useState(collection?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(collection?.sortOrder ?? 0));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = () =>
    start(async () => {
      const r = await saveCollectionAction(collection?.id ?? null, { name, slug, description, isFeatured, isActive, sortOrder: Math.max(0, Math.floor(Number(sortOrder) || 0)) });
      if (!r.ok) {
        setErrors(r.fieldErrors ?? {});
        return void toast.error(r.message);
      }
      setErrors({});
      toast.success(collection ? "Saved" : "Collection created");
      if (collection) router.refresh();
      else router.push(`/admin/collections/${r.data.id}`);
    });

  const remove = () =>
    start(async () => {
      if (!collection) return;
      const r = await deleteCollectionAction(collection.id);
      if (!r.ok) return void toast.error(r.message);
      toast.success("Collection deleted");
      router.push("/admin/collections");
    });

  return (
    <form onSubmit={(e) => { e.preventDefault(); save(); }} className="max-w-2xl space-y-4 rounded-md border border-border bg-surface p-5" data-testid="collection-editor">
      <div><Label htmlFor="c-name">Name</Label><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 bg-bg" /><FieldError errors={errors.name} /></div>
      <div><Label htmlFor="c-slug">URL slug</Label><Input id="c-slug" value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Leave blank to generate" className="mt-1 bg-bg" /><FieldError errors={errors.slug} /></div>
      <div><Label htmlFor="c-desc">Description</Label><textarea id="c-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-border bg-bg p-3 text-sm" /></div>
      <div className="flex flex-wrap items-center gap-6 text-sm">
        <label className="flex items-center gap-2"><input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} className="accent-brand" />Visible on the store</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={isFeatured} onChange={(e) => setFeatured(e.target.checked)} className="accent-brand" />Featured on the home page</label>
        <label className="flex items-center gap-2">Order<input value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" aria-label="Sort order" className="h-8 w-16 rounded-md border border-border bg-bg px-2" /></label>
      </div>
      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={pending} data-testid="save-collection">{pending ? "Saving…" : collection ? "Save changes" : "Create collection"}</Button>
        {collection && <Button type="button" variant="destructive" disabled={pending} onClick={remove} data-testid="delete-collection">Delete collection</Button>}
      </div>
    </form>
  );
}
