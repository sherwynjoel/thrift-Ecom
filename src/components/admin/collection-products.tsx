"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { ArrowDown, ArrowUp, X } from "lucide-react";
import { toast } from "sonner";
import { removeProductFromCollectionAction, reorderCollectionProductsAction } from "@/app/admin/collections/actions";
import { cn } from "@/lib/utils";
import type { AdminCollectionDetail } from "@/server/services/admin-collections";
import { StatusBadge } from "./status-badge";

const GENERIC_ERROR = "Something went wrong. Please try again.";
const iconButton = "grid size-11 shrink-0 place-items-center rounded-md text-text-muted transition-colors disabled:opacity-30 hover:bg-surface-raised hover:text-text";

export function CollectionProducts({ collectionId, products }: { collectionId: string; products: AdminCollectionDetail["products"] }) {
  const [list, setList] = useState(products);
  const [pending, start] = useTransition();
  const [confirmRemoveId, setConfirmRemoveId] = useState<string | null>(null);

  useEffect(() => {
    if (!confirmRemoveId) return;
    const t = setTimeout(() => setConfirmRemoveId(null), 3000);
    return () => clearTimeout(t);
  }, [confirmRemoveId]);

  const move = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= list.length) return;
    const next = [...list];
    [next[i], next[j]] = [next[j], next[i]];
    const prev = list;
    setList(next);
    start(async () => {
      try {
        const r = await reorderCollectionProductsAction(collectionId, next.map((p) => p.id));
        if (!r.ok) {
          toast.error(r.message);
          setList(prev);
        }
      } catch {
        toast.error(GENERIC_ERROR);
        setList(prev);
      }
    });
  };
  const remove = (id: string) =>
    start(async () => {
      try {
        const r = await removeProductFromCollectionAction(collectionId, id);
        if (!r.ok) return void toast.error(r.message);
        setList((l) => l.filter((p) => p.id !== id));
      } catch {
        toast.error(GENERIC_ERROR);
      }
    });
  const clickRemove = (id: string) => {
    if (confirmRemoveId === id) {
      setConfirmRemoveId(null);
      remove(id);
    } else {
      setConfirmRemoveId(id);
    }
  };
  return (
    <section className="max-w-2xl space-y-3 rounded-md border border-border bg-surface p-5" data-testid="collection-products">
      <h2 className="text-2xl">Products ({list.length})</h2>
      <p className="text-xs text-text-muted">This order is the &ldquo;Featured&rdquo; sort on the storefront. Add products to this collection from each product&apos;s page.</p>
      {list.length === 0 ? <p className="text-sm text-text-muted">No products yet.</p> : (
        <ol className="divide-y divide-border">
          {list.map((p, i) => (
            <li key={p.id} className="flex flex-wrap items-center gap-2 py-2 sm:flex-nowrap" data-testid="collection-product">
              <span className="w-6 shrink-0 text-right text-xs text-text-muted">{i + 1}</span>
              <span className="relative size-10 shrink-0 overflow-hidden rounded-sm bg-surface-raised">{p.imageUrl && <Image src={p.imageUrl} alt="" fill sizes="40px" className="object-cover" />}</span>
              <Link href={`/admin/products/${p.id}`} className="min-w-0 flex-1 basis-32 truncate text-sm hover:underline">{p.name}</Link>
              <StatusBadge status={p.status} />
              <div className="ml-auto flex items-center gap-1 sm:ml-0">
                <button type="button" onClick={() => move(i, -1)} disabled={i === 0 || pending} aria-label={`Move ${p.name} up`} className={iconButton}><ArrowUp className="size-5" /></button>
                <button type="button" onClick={() => move(i, 1)} disabled={i === list.length - 1 || pending} aria-label={`Move ${p.name} down`} className={iconButton}><ArrowDown className="size-5" /></button>
                <button
                  type="button"
                  onClick={() => clickRemove(p.id)}
                  disabled={pending}
                  aria-label={confirmRemoveId === p.id ? `Confirm remove ${p.name} from collection` : `Remove ${p.name} from collection`}
                  className={cn(iconButton, confirmRemoveId === p.id ? "bg-danger/10 text-danger hover:bg-danger/20 hover:text-danger" : "hover:text-danger")}
                >
                  {confirmRemoveId === p.id ? <span className="px-1 text-xs font-medium">Confirm?</span> : <X className="size-5" />}
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
