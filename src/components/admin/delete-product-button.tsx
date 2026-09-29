"use client";

import type { ProductStatus } from "@prisma/client";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { deleteProductAction } from "@/app/admin/products/actions";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogTitle } from "@/components/ui/dialog";

export function DeleteProductButton({ id, status }: { id: string; status: ProductStatus }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  if (status === "ACTIVE") return <p className="text-xs text-text-muted">Archive the product to delete it.</p>;
  const confirm = () =>
    start(async () => {
      const r = await deleteProductAction(id);
      if (r.ok) {
        toast.success("Product deleted");
        router.push("/admin/products");
      } else {
        toast.error(r.message);
        setOpen(false);
      }
    });
  return (
    <>
      <Button type="button" variant="destructive" onClick={() => setOpen(true)} data-testid="delete-product">Delete product</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="bg-bg">
          <DialogTitle>Delete this product?</DialogTitle>
          <DialogDescription>This removes its variants and images, and takes it out of every bag. It cannot be undone.</DialogDescription>
          <DialogFooter>
            <Button type="button" variant="secondary" onClick={() => setOpen(false)}>Cancel</Button>
            <Button type="button" variant="destructive" onClick={confirm} disabled={pending} data-testid="confirm-delete">{pending ? "Deleting…" : "Delete"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
