"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Boxes, Gift, Images, LayoutDashboard, Layers, Menu, Package, Printer, Settings, ShoppingBag, Star, Store, Ticket, Users } from "lucide-react";
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import { cn } from "@/lib/utils";

const ITEMS = [
  { href: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { href: "/admin/orders", label: "Orders", icon: ShoppingBag },
  { href: "/admin/print-queue", label: "Print queue", icon: Printer },
  { href: "/admin/products", label: "Products", icon: Package },
  { href: "/admin/collections", label: "Collections", icon: Layers },
  { href: "/admin/inventory", label: "Inventory", icon: Boxes },
  { href: "/admin/customers", label: "Customers", icon: Users },
  { href: "/admin/reviews", label: "Reviews", icon: Star },
  { href: "/admin/coupons", label: "Coupons", icon: Ticket },
  { href: "/admin/offers", label: "Offers", icon: Gift },
  { href: "/admin/banners", label: "Banners", icon: Images },
  { href: "/admin/settings", label: "Settings", icon: Settings },
];

type Counts = { toShipCount: number; printQueueCount: number; pendingReviewCount: number };

function Badge({ count, testId, label }: { count: number; testId: string; label: string }) {
  if (count <= 0) return null;
  return (
    <span className="ml-auto rounded-full bg-brand px-2 py-0.5 text-xs font-medium text-brand-ink" data-testid={testId}>
      <span className="sr-only">{label}: </span>
      {count}
    </span>
  );
}

function NavLinks({ toShipCount, printQueueCount, pendingReviewCount }: Counts) {
  const pathname = usePathname();
  return (
    <>
      {ITEMS.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname.startsWith(href);
        return (
          <Link key={href} href={href} aria-current={active ? "page" : undefined} className={cn("relative flex min-h-11 shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm lg:gap-2", active ? "bg-surface-raised text-text" : "text-text-muted hover:bg-surface hover:text-text")}>
            <Icon className="size-4" />
            {label}
            {href === "/admin/orders" && <Badge count={toShipCount} testId="to-ship-badge" label="To ship" />}
            {href === "/admin/print-queue" && <Badge count={printQueueCount} testId="print-queue-badge" label="To print" />}
            {href === "/admin/reviews" && <Badge count={pendingReviewCount} testId="reviews-badge" label="Waiting for approval" />}
          </Link>
        );
      })}
      <Link href="/" className="mt-auto flex min-h-11 shrink-0 items-center gap-3 rounded-md px-3 py-2 text-sm text-text-muted hover:text-text lg:mt-6 lg:gap-2">
        <Store className="size-4" /> View store
      </Link>
    </>
  );
}

/**
 * lg+: the sidebar list. Below lg: a menu button opening a left drawer with the same links.
 * The drawer's links mount only while it is open, so badge test ids are never duplicated on screen.
 */
export function AdminNav(counts: Counts) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  useEffect(() => setOpen(false), [pathname]);
  const pending = counts.toShipCount + counts.printQueueCount + counts.pendingReviewCount > 0;
  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger className="relative -ml-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md lg:hidden" aria-label="Open admin menu" data-testid="admin-menu">
          <Menu className="size-5" />
          {pending && <span aria-hidden="true" className="absolute right-2 top-2 size-2 rounded-full bg-brand" />}
        </SheetTrigger>
        <SheetContent side="left" className="w-[85vw] max-w-xs gap-0 overflow-y-auto bg-surface p-4 pb-safe">
          <SheetTitle className="mb-4 flex min-h-11 items-center font-display text-2xl uppercase">Admin</SheetTitle>
          <nav className="flex flex-1 flex-col gap-1" aria-label="Admin">
            <NavLinks {...counts} />
          </nav>
        </SheetContent>
      </Sheet>
      <nav className="hidden gap-1 lg:order-2 lg:flex lg:flex-col" aria-label="Admin">
        <NavLinks {...counts} />
      </nav>
    </>
  );
}
