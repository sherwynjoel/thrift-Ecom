"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { useCartUI } from "./cart-ui";

export function CartDrawer({ itemCount, children }: { itemCount: number; children: React.ReactNode }) {
  const { open, setOpen } = useCartUI();
  const pathname = usePathname();
  useEffect(() => setOpen(false), [pathname, setOpen]);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetContent side="right" className="flex w-full flex-col bg-bg sm:max-w-md" data-testid="cart-drawer">
        <SheetHeader>
          <SheetTitle className="font-display text-2xl uppercase tracking-tight">Your bag ({itemCount})</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col overflow-y-auto px-1">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
