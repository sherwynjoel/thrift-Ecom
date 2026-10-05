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
      {/* Full screen on phones (data-[side] beats the sheet's default 3/4 width); a side panel from sm up. */}
      <SheetContent side="right" className="flex flex-col gap-0 bg-bg pt-[env(safe-area-inset-top)] data-[side=right]:w-full data-[side=right]:sm:max-w-md" data-testid="cart-drawer">
        <SheetHeader className="flex h-15 justify-center px-5 py-0 pr-14">
          <SheetTitle className="font-display text-2xl uppercase tracking-tight">Your bag ({itemCount})</SheetTitle>
        </SheetHeader>
        <div className="flex flex-1 flex-col overflow-y-auto px-5">{children}</div>
      </SheetContent>
    </Sheet>
  );
}
