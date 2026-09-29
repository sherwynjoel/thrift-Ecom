"use client";

import Image from "next/image";
import Link from "next/link";
import { useState, useTransition } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { toast } from "sonner";
import { removeProductFromCollectionAction, reorderCollectionProductsAction } from "@/app/admin/collections/actions";
import type { AdminCollectionDetail } from "@/server/services/admin-collections";
import { StatusBadge } from "./status-badge";

export function CollectionProducts({ collectionId, products }: { collectionId: string; products: AdminCollectionDetail["products"] }) {
  const [list, setList] = useState(products);
  const [pending, start] = useTransition();
  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    const prev = list;
    setList(next);
    start(async () => {
      const r = await reorderCollectionProductsAction(collectionId, next.map((p) => p.id));
      if (!r.ok) {
        toast.error(r.message);
        setList(prev);
      }
    });
  };
  const remove = (id: string) =>
    start(async () => {
      const r = await removeProductFromCollectionAction(collectionId, id);
      if (!r.ok) return void toast.error(r.message);
      setList((l) => l.filter((p) => p.id !== id));
    });
  return (
    <section className="max-w-2xl space-y-3 rounded-md border border-border bg-surface p-5" data-testid="collection-products">
      <h2 className="text-2xl">Products ({list.length})</h2>
      <p className="text-xs text-text-muted">This order is the &ldquo;Featured&rdquo; sort on the storefront. Add products to this collection from each product&apos;s page.</p>
      {list.length === 0 ? <p className="text-sm text-text-muted">No products yet.</p> : (
        <ol className="divide-y divide-border">
          {list.map((p, i) => (
            <li key={p.id} className="flex items-center gap-3 py-2" data-testid="collection-product">
              <span className="w-6 text-right text-xs text-text-muted">{i + 1}</span>
              <span className="relative size-10 shrink-0 overflow-hidden rounded-sm bg-surface-raised">{p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="40px" className="object-cover" />}</span>
              <Link href={`/admin/products/${p.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">{p.name}</Link>
              <StatusBadge status={p.status} />
              <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || pending} aria-label={`Move ${p.name} up`} className="p-1 disabled:opacity-30"><ArrowUp className="size-4" /></button>
              <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1 || pending} aria-label={`Move ${p.name} down`} className="p-1 disabled:opacity-30"><ArrowDown className="size-4" /></button>
              <button type="button" onClick={() => remove(p.id)} disabled={pending} aria-label={`Remove ${p.name} from collection`} className="p-1 text-text-muted hover:text-danger"><X className="size-4" /></button>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
