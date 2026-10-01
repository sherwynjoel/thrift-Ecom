"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteCollectionAction, saveCollectionAction } from "@/app/admin/collections/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminCollectionDetail } from "@/server/services/admin-collections";
import { FieldError } from "./field-error";

const GENERIC_ERROR = "Something went wrong. Please try again.";

/** A bare non-negative integer, e.g. "0" or "42" — rejects blank, negative, decimal and non-numeric text. */
function parseSortOrder(text: string): number | null {
  const trimmed = text.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const n = Number(trimmed);
  return Number.isSafeInteger(n) ? n : null;
}

export function CollectionEditor({ collection }: { collection: AdminCollectionDetail | null }) {
  const [name, setName] = useState(collection?.name ?? "");
  const [slug, setSlug] = useState(collection?.slug ?? "");
  const [description, setDescription] = useState(collection?.description ?? "");
  const [isFeatured, setFeatured] = useState(collection?.isFeatured ?? false);
  const [isActive, setActive] = useState(collection?.isActive ?? true);
  const [sortOrder, setSortOrder] = useState(String(collection?.sortOrder ?? 0));
  const [errors, setErrors] = useState<Record<string, string[]>>({});
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();

  const save = () => {
    const parsedOrder = parseSortOrder(sortOrder);
    if (parsedOrder === null) {
      setErrors((e) => ({ ...e, sortOrder: ["Enter a whole number, 0 or higher"] }));
      toast.error("Fix the highlighted fields");
      return;
    }
    start(async () => {
      try {
        const r = await saveCollectionAction(collection?.id ?? null, { name, slug, description, isFeatured, isActive, sortOrder: parsedOrder });
        if (!r.ok) {
          setErrors(r.fieldErrors ?? {});
          return void toast.error(r.message);
        }
        setErrors({});
        toast.success(collection ? "Saved" : "Collection created");
        if (collection) router.refresh();
        else router.push(`/admin/collections/${r.data.id}`);
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });
  };

  const remove = () =>
    start(async () => {
      if (!collection) return;
      try {
        const r = await deleteCollectionAction(collection.id);
        if (!r.ok) return void toast.error(r.message);
        toast.success("Collection deleted");
        router.push("/admin/collections");
      } catch {
        toast.error(GENERIC_ERROR);
        setConfirmDelete(false);
      }
    });

  return (
    <>
      <form onSubmit={(e) => { e.preventDefault(); save(); }} className="max-w-2xl space-y-4 rounded-md border border-border bg-surface p-5" data-testid="collection-editor">
        <div><Label htmlFor="c-name">Name</Label><Input id="c-name" value={name} onChange={(e) => setName(e.target.value)} className="mt-1 bg-bg" /><FieldError errors={errors.name} /></div>
        <div><Label htmlFor="c-slug">URL slug</Label><Input id="c-slug" autoCapitalize="none" autoCorrect="off" spellCheck={false} value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Leave blank to generate" className="mt-1 bg-bg" /><FieldError errors={errors.slug} /></div>
        <div>
          <Label htmlFor="c-desc">Description</Label>
          <textarea id="c-desc" value={description} onChange={(e) => setDescription(e.target.value)} rows={3} className="mt-1 w-full rounded-md border border-border bg-bg p-3 text-sm" />
          <FieldError errors={errors.description} />
        </div>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={isActive} onChange={(e) => setActive(e.target.checked)} className="size-5 accent-brand" />Visible on the store</label>
          <label className="flex min-h-11 items-center gap-3"><input type="checkbox" checked={isFeatured} onChange={(e) => setFeatured(e.target.checked)} className="size-5 accent-brand" />Featured on the home page</label>
          <div>
            <label htmlFor="c-order" className="flex items-center gap-2">Order<input id="c-order" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} inputMode="numeric" className="h-11 w-16 lg:h-8 rounded-md border border-border bg-bg px-2" /></label>
            <FieldError errors={errors.sortOrder} />
          </div>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={pending} data-testid="save-collection">{pending ? "Saving…" : collection ? "Save changes" : "Create collection"}</Button>
          {collection && <Button type="button" variant="destructive" disabled={pending} onClick={() => setConfirmDelete(true)} data-testid="delete-collection">Delete collection</Button>}
        </div>
      </form>
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="bg-bg">
          <DialogTitle>Delete this collection?</DialogTitle>
          <DialogDescription>Products stay, but are removed from it. This cannot be undone.</DialogDescription>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setConfirmDelete(false)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={remove} disabled={pending} data-testid="confirm-delete-collection">{pending ? "Deleting…" : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
