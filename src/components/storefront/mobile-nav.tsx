"use client";

import Link from "next/link";
import { useState } from "react";
import { Menu } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { SITE_NAV } from "@/config/site";

export function MobileNav() {
  const [open, setOpen] = useState(false);
  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger className="-ml-2 inline-flex size-11 items-center justify-center lg:hidden" aria-label="Open menu"><Menu className="size-5" /></SheetTrigger>
      <SheetContent side="left" className="gap-0 bg-bg px-6 pb-[max(env(safe-area-inset-bottom),1.5rem)] pt-[calc(env(safe-area-inset-top)+0.5rem)]">
        {/* h-11 matches the 44px close button, so "Menu" and × share one baseline row; pr-12 keeps clear of it. */}
        <SheetTitle className="flex h-11 items-center pr-12 font-display text-2xl uppercase text-text-muted">Menu</SheetTitle>
        <nav className="mt-6 flex flex-col gap-1 border-t border-border pt-6">
          {SITE_NAV.map((item) => (
            <Link key={item.href} href={item.href} onClick={() => setOpen(false)} className="flex min-h-11 items-center font-display text-3xl uppercase tracking-tight">{item.label}</Link>
          ))}
        </nav>
      </SheetContent>
    </Sheet>
  );
}
